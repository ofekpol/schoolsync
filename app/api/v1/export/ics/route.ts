import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveGanttSchoolFromParam } from "@/lib/db/schools";
import { getAgendaForSchool } from "@/lib/views/agenda";
import { serializeCalendar, type ICalEvent } from "@/lib/ical/serializer";

/**
 * Public, unauthenticated bulk `.ics` export for a school's events, keyed by
 * the school's secret link token (`?school=<token>`) — never its slug.
 *
 * Mirrors the iCal subscription feed (app/ical/[token]/route.ts) but is
 * stateless: filters come from query params instead of a stored subscription,
 * and the response is an attachment the user imports into Google Calendar
 * (Settings → Import & Export). RLS is enforced because getAgendaForSchool
 * wraps every query in withSchool(schoolId, …).
 */

/** "10,11" → [10, 11]; empty/absent → undefined (= no filter). */
const csvNumbers = z
  .string()
  .optional()
  .transform((raw) =>
    raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number)
      : [],
  )
  .pipe(z.array(z.number().int().min(7).max(12)));

/** "trip,exam" → ["trip", "exam"]; empty/absent → []. */
const csvStrings = z
  .string()
  .optional()
  .transform((raw) =>
    raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );

const QuerySchema = z.object({
  school: z.string().min(1),
  grades: csvNumbers,
  eventTypes: csvStrings,
  // Accepted for forward-compatibility. getAgendaForSchool already scopes to
  // the active academic year's bounds, so this is validated and ignored.
  academicYear: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    school: url.searchParams.get("school") ?? undefined,
    grades: url.searchParams.get("grades") ?? undefined,
    eventTypes: url.searchParams.get("eventTypes") ?? undefined,
    academicYear: url.searchParams.get("academicYear") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { school: accessToken, grades, eventTypes } = parsed.data;

  const school = await resolveGanttSchoolFromParam(accessToken);
  if (!school) return new NextResponse("Not found", { status: 404 });

  const events = await getAgendaForSchool(school.id, {
    grades: grades.length > 0 ? grades : undefined,
    types: eventTypes.length > 0 ? eventTypes : undefined,
  });

  const ical: ICalEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: new Date(e.startAt),
    endAt: new Date(e.endAt),
    allDay: e.allDay,
    eventTypeLabelHe: e.eventTypeLabelHe,
    canceled: e.isCanceled === true,
    // Stable DTSTAMP from the row's edit stamp (see iCal feed).
    updatedAt: new Date(e.updatedAt ?? e.startAt),
    version: e.version ?? 1,
  }));

  const body = serializeCalendar({
    schoolName: school.name,
    schoolSlug: school.slug,
    events: ical,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="school-events.ics"',
      "Cache-Control": "no-store",
    },
  });
}

export const dynamic = "force-dynamic";
