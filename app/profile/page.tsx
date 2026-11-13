import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { isDemoUser, signedOutPath } from "@/lib/auth/demo-guard";
import { listCategories } from "@/lib/profile/categories";
import { getStaffOptionIds } from "@/lib/profile/staff-labels";
import { ProfileForm } from "@/components/profile/ProfileForm";

const HOME = "/dashboard";

/**
 * A staff member's own profile labels. Lives outside the (staff) group, like
 * /auth/change-password, so the profile gate can send people here without a loop.
 */
export default async function ProfilePage() {
  const user = await getStaffUser();
  if (!user) redirect(await signedOutPath());
  if (user.status === "pending") redirect("/auth/pending");
  if (user.status === "deactivated") redirect("/auth/deactivated");
  if (user.mustChangePassword) redirect("/auth/change-password");
  if (!user.schoolId || isDemoUser(user)) redirect(HOME);

  const [categories, selected, t] = await Promise.all([
    listCategories(user.schoolId),
    getStaffOptionIds(user.schoolId, user.id),
    getTranslations("profile"),
  ]);
  if (categories.length === 0) redirect(HOME);

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-6 rounded-lg border p-6 shadow-sm sm:p-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <ProfileForm categories={categories} selected={selected} submitUrl="/api/v1/profile"
          savedHref={HOME} />
      </div>
    </main>
  );
}
