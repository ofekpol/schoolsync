import { redirect } from "next/navigation";
import { getStaffUser } from "@/lib/auth/session";
import { requireService } from "@/lib/auth/service-guard";
import {
  getEditorAllowedGrades,
  getEventForEditor,
  listEventTypes,
} from "@/lib/events/queries";
import { WizardShell } from "@/components/wizard/WizardShell";
import { jerusalemOffset } from "@/lib/datetime";

interface PageProps {
  searchParams: Promise<{ resumeId?: string; date?: string }>;
}

/**
 * New Event page — Server Component.
 * Consumes lib/events/queries.ts exclusively (no direct withSchool or schema imports).
 * Supports resuming a draft via ?resumeId= (WIZARD-03).
 */
export default async function NewEventPage({ searchParams }: PageProps) {
  const user = await getStaffUser();
  if (!user || !user.schoolId) redirect("/");
  await requireService(user, "gantt");
  if (user.role === "viewer") redirect("/dashboard");

  const { resumeId, date } = await searchParams;
  const initialDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

  const [eventTypeList, allowedGradesRaw] = await Promise.all([
    listEventTypes(user.schoolId),
    user.role === "editor"
      ? getEditorAllowedGrades(user.schoolId, user.id)
      : Promise.resolve([7, 8, 9, 10, 11, 12] as number[]),
  ]);

  const allowedGrades = allowedGradesRaw;

  const resumeDraft = resumeId
    ? await getEventForEditor(user.schoolId, resumeId, user.id, user.role === "admin").then(
        (result) => {
          if (!result) return null;
          const { event, grades } = result;
          return {
            title: event.title ?? undefined,
            // Serialize as Jerusalem-tz ISO so the editor can slice [11:16]
            // to recover the local time without a tz library.
            startAt: event.startAt ? toJerusalemIso(event.startAt) : undefined,
            endAt: event.endAt ? toJerusalemIso(event.endAt) : undefined,
            allDay: event.allDay,
            eventTypeId: event.eventTypeId,
            location: event.location ?? undefined,
            description: event.description ?? undefined,
            grades,
          };
        },
      )
    : null;

  return (
    <WizardShell
      eventTypes={eventTypeList}
      allowedGrades={allowedGrades}
      resumeDraft={resumeDraft}
      resumeId={resumeId ?? null}
      initialDate={initialDate}
    />
  );
}

const JERUSALEM_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function toJerusalemIso(d: Date): string {
  // sv-SE produces "YYYY-MM-DD HH:MM:SS" — replace space, append the
  // Jerusalem offset in effect at that instant (+02:00 or +03:00).
  return JERUSALEM_FMT.format(d).replace(" ", "T") + jerusalemOffset(d);
}
