import { redirect } from "next/navigation";

/** Profile categories now live in a tab of the staff page; keep old links working. */
export default function AdminCategoriesPage(): never {
  redirect("/admin/staff?tab=categories");
}
