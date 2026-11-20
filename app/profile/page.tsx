import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { isDemoUser, signedOutPath } from "@/lib/auth/demo-guard";
import { listCategories } from "@/lib/profile/categories";
import { getStaffOptionIds } from "@/lib/profile/staff-labels";
import { getSchoolById } from "@/lib/db/schools";
import { homePathFor } from "@/lib/services";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileIdentity } from "@/components/profile/ProfileIdentity";
import { StaffShell } from "@/components/staff/StaffShell";

/**
 * A staff member's own profile labels. Lives outside the (staff) group, like
 * /auth/change-password, so the profile gate can send people here without a loop:
 * the first visit is a focused standalone screen; once the profile has been saved,
 * the page opens inside the normal staff header (the "פרופיל" link).
 */
export default async function ProfilePage() {
  const user = await getStaffUser();
  if (!user) redirect(await signedOutPath());
  if (user.status === "pending") redirect("/auth/pending");
  if (user.status === "deactivated") redirect("/auth/deactivated");
  if (user.mustChangePassword) redirect("/auth/change-password");
  if (!user.schoolId) redirect("/dashboard");
  const school = await getSchoolById(user.schoolId);
  const home = homePathFor(school?.services ?? ["gantt"]);
  if (isDemoUser(user)) redirect(home);

  const [categories, selected, t] = await Promise.all([
    listCategories(user.schoolId),
    getStaffOptionIds(user.schoolId, user.id),
    getTranslations("profile"),
  ]);
  if (categories.length === 0) redirect(home);
  const firstRun = !user.profileCompletedAt;

  const content = (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:pt-12">
      <ProfileIdentity user={user} schoolName={school?.name} />
      <section aria-labelledby="profile-labels" className="mt-10 sm:mt-12">
        <h2 id="profile-labels"
          className="font-[family-name:var(--sg-font-display)] text-xl font-semibold text-[var(--sg-ink)] sm:text-2xl">
          {t(firstRun ? "firstRunTitle" : "labelsTitle")}
        </h2>
        <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-[var(--sg-ink-mute)]">{t("intro")}</p>
        <div className="sg-card mt-5 rounded-2xl">
          <ProfileForm categories={categories} selected={selected} submitUrl="/api/v1/profile"
            variant="page"
            savedHref={firstRun ? home : undefined}
            backHref={firstRun ? undefined : home}
            saveLabel={firstRun ? "saveContinue" : "save"} />
        </div>
      </section>
    </main>
  );

  if (firstRun) return <div className="min-h-[100dvh]">{content}</div>;
  return <StaffShell user={user} withChat={false}>{content}</StaffShell>;
}
