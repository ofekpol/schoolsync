import "server-only";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withSchool } from "@/lib/db/client";
import { academicYears } from "@/lib/db/schema";
import { getActiveAcademicYearId, getSchoolById } from "@/lib/db/schools";
import { listEventTypes } from "@/lib/events/queries";
import { getAgendaForSchool } from "@/lib/views/agenda";
import type { AgendaItem } from "@/lib/views/agenda-model";
import { jerusalemDateString, jerusalemTimeString } from "@/lib/datetime";
import { formatGradeLabel } from "@/lib/grades";
import { GradeSchema } from "@/lib/validations/grade";

const MAX_RANGE_DAYS = 400;
const MAX_RESULTS = 50;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const RangeSchema = z.object({ fromDate: isoDate, toDate: isoDate });

export const SearchInputSchema = RangeSchema.extend({
  grades: z.array(GradeSchema).optional().describe("7=ז … 12=יב"),
  typeKeys: z.array(z.string()).optional().describe("event type keys from listEventTypes"),
  query: z.string().max(100).optional().describe("text to match in the event title"),
});
export const CountInputSchema = RangeSchema.extend({ groupBy: z.enum(["type", "grade", "month"]) });

type SearchInput = z.infer<typeof SearchInputSchema>;
type CountInput = z.infer<typeof CountInputSchema>;

export interface ChatEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  grades: string[];
  type: string;
  location: string | null;
  canceled: boolean;
}

function rangeTooLong({ fromDate, toDate }: { fromDate: string; toDate: string }): boolean {
  const days = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
  return days < 0 || days > MAX_RANGE_DAYS;
}

function stamp(instant: Date): string {
  const [y, m, d] = jerusalemDateString(instant).split("-");
  return `${d}/${m}/${y} ${jerusalemTimeString(instant)}`;
}

function toChatEvent(e: AgendaItem): ChatEvent {
  return {
    title: e.title,
    start: stamp(e.startAt),
    end: stamp(e.endAt),
    allDay: e.allDay,
    grades: e.grades.map(formatGradeLabel),
    type: e.eventTypeLabelHe,
    location: e.location,
    canceled: e.isCanceled === true,
  };
}

async function loadRange(schoolId: string, input: SearchInput): Promise<AgendaItem[]> {
  return getAgendaForSchool(schoolId, {
    dateBounds: { startDate: input.fromDate, endDate: input.toDate },
    grades: input.grades,
    types: input.typeKeys,
    q: input.query,
  });
}

/** Events of `schoolId` in a date range (approved/canceled, not deleted), capped at 50. */
export async function searchSchoolEvents(schoolId: string, input: SearchInput) {
  if (rangeTooLong(input)) return { events: [] as ChatEvent[], error: "range_too_long" as const };
  const items = await loadRange(schoolId, input);
  return { events: items.slice(0, MAX_RESULTS).map(toChatEvent), total: items.length };
}

/** Event counts of `schoolId` in a date range, grouped by type, grade or month (YYYY-MM). */
export async function countSchoolEvents(schoolId: string, input: CountInput) {
  if (rangeTooLong(input)) return { counts: [] as { key: string; count: number }[], error: "range_too_long" as const };
  const items = await loadRange(schoolId, input);
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const e of items) {
    if (input.groupBy === "type") bump(e.eventTypeLabelHe);
    else if (input.groupBy === "month") bump(jerusalemDateString(e.startAt).slice(0, 7));
    else e.grades.forEach((g) => bump(formatGradeLabel(g)));
  }
  return { counts: [...counts].map(([key, count]) => ({ key, count })) };
}

/** School name and its active academic year, if one is set. */
export async function getSchoolInfo(schoolId: string) {
  const [school, yearId] = await Promise.all([getSchoolById(schoolId), getActiveAcademicYearId(schoolId)]);
  if (!yearId) return { name: school?.name ?? "", academicYear: null };
  const [year] = await withSchool(schoolId, (tx) =>
    tx
      .select({ label: academicYears.label, startDate: academicYears.startDate, endDate: academicYears.endDate })
      .from(academicYears)
      .where(eq(academicYears.id, yearId))
      .limit(1),
  );
  return { name: school?.name ?? "", academicYear: year ?? null };
}

/**
 * Read-only tools for the staff chat. `schoolId` comes from the session and is
 * closed over — it is never a tool parameter the model could change.
 */
export function buildChatTools(schoolId: string) {
  return {
    searchEvents: tool({
      description: "Find this school's events in a date range (max 400 days), optionally by grades, type keys, or title text.",
      inputSchema: SearchInputSchema,
      execute: (input) => searchSchoolEvents(schoolId, input),
    }),
    countEvents: tool({
      description: "Count this school's events in a date range, grouped by type, grade, or month.",
      inputSchema: CountInputSchema,
      execute: (input) => countSchoolEvents(schoolId, input),
    }),
    listEventTypes: tool({
      description: "List this school's event types (key and Hebrew label).",
      inputSchema: z.object({}),
      execute: async () => (await listEventTypes(schoolId)).map((t) => ({ key: t.key, labelHe: t.labelHe })),
    }),
    getSchoolInfo: tool({
      description: "This school's name and active academic year dates.",
      inputSchema: z.object({}),
      execute: () => getSchoolInfo(schoolId),
    }),
  };
}
