import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { requireService } from "@/lib/auth/service-guard";
import { listEventTypes } from "@/lib/admin/event-types";
import { EventTypeManager } from "@/components/admin/event-types/EventTypeManager";
import { GradeColorSettings } from "@/components/admin/GradeColorSettings";
import { getGradeColors } from "@/lib/db/grade-colors";

/**
 * Admin event-types management page — Server Component.
 * Compact list of event types in display order. Admins edit, delete and
 * reorder and also get the per-grade calendar colors; editors can only add.
 * ADMIN-02 entry point.
 */
export default async function AdminEventTypesPage() {
  const user = await getStaffUser();
  if (!user || !user.schoolId) redirect("/");
  await requireService(user, "gantt");
  if (user.role === "viewer") redirect("/dashboard");

  const isAdmin = user.role === "admin";
  const [eventTypes, gradeColors] = await Promise.all([
    listEventTypes(user.schoolId),
    isAdmin ? getGradeColors(user.schoolId) : Promise.resolve(null),
  ]);
  const t = await getTranslations("admin.eventTypes");

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      <section aria-labelledby="event-types-title">
        <h1 id="event-types-title" className="text-lg font-semibold">{t("title")}</h1>
        <p className="mb-3 text-xs text-neutral-500">
          {isAdmin ? t("description") : t("descriptionEditor")}
        </p>
        <EventTypeManager initial={eventTypes} canManage={isAdmin} />
      </section>
      {gradeColors && <GradeColorSettings initial={gradeColors} />}
    </main>
  );
}
