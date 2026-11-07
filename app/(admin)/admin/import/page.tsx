import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { listEventTypes } from "@/lib/admin/event-types";
import { importTemplateCsv } from "@/lib/import/calendar-import";
import { CalendarImport } from "@/components/admin/CalendarImport";

/** Admin-only: bring a new school's existing calendar in from the CSV template. */
export default async function AdminImportPage() {
  const user = await getStaffUser();
  if (!user || !user.schoolId) redirect("/");
  if (user.role !== "admin") redirect("/dashboard");

  const [eventTypes, t] = await Promise.all([listEventTypes(user.schoolId), getTranslations("admin.import")]);
  const typeLabels = Object.fromEntries(eventTypes.map((type) => [type.id, type.labelHe]));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <ol className="list-decimal space-y-1 ps-6 text-sm">
        <li>{t("step1")}</li>
        <li>{t("step2", { types: eventTypes.map((type) => type.labelHe).join(", ") })}</li>
        <li>{t("step3")}</li>
      </ol>
      <CalendarImport template={importTemplateCsv()} typeLabels={typeLabels} />
    </main>
  );
}
