import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { listCategories } from "@/lib/profile/categories";
import { CategoryManager } from "@/components/profile/CategoryManager";

/** Admin page: the school's profile categories and their options. */
export default async function AdminCategoriesPage() {
  const user = await getStaffUser();
  if (!user || !user.schoolId) redirect("/");
  if (user.role !== "admin") redirect("/dashboard");

  const [categories, t] = await Promise.all([
    listCategories(user.schoolId),
    getTranslations("admin.categories"),
  ]);
  const demo = isDemoUser(user);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="mb-3 text-xs text-neutral-500">{t("description")}</p>
      {demo && (
        <p role="note" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("demoNote")}
        </p>
      )}
      <CategoryManager initial={categories} readOnly={demo} />
    </main>
  );
}
