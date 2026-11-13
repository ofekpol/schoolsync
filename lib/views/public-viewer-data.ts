import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { resolveGanttSchoolFromParam, type PublicSchoolRecord } from "@/lib/db/schools";
import { getGradeColors } from "@/lib/db/grade-colors";
import type { GradeColorMap } from "@/lib/grade-colors";
import { listEventTypes } from "@/lib/events/queries";
import { getAgendaForSchool, getAgendaSignatureForSchool } from "@/lib/views/agenda";
import { toPublicEventPayload, type PublicViewerEvent } from "@/lib/views/public-viewer";
import { buildCalendarRangeFromEvents } from "@/lib/views/date-range";

export interface PublicViewerEventType {
  id: string;
  key: string;
  labelHe: string;
  labelEn: string;
  colorHex: string;
  glyph: string;
  sortOrder: number;
}

export interface PublicViewerYear {
  label: string;
  startDate: string;
  endDate: string;
}

export interface PublicViewerData {
  school: PublicSchoolRecord;
  year: PublicViewerYear;
  eventTypes: PublicViewerEventType[];
  gradeColors: GradeColorMap;
  events: PublicViewerEvent[];
  eventSignature: string;
}

export function getPublicViewerCacheTag(slug: string): string {
  return `public-viewer:${slug}`;
}

export function invalidatePublicViewerCache(slug: string | null | undefined): void {
  if (!slug) return;
  revalidateTag(getPublicViewerCacheTag(slug));
}

/**
 * Public loaders take the untrusted school link token straight from the URL.
 * The token → school lookup runs uncached (one indexed read) so the cache and
 * its invalidation tag stay keyed by slug, which mutations know.
 */
export async function loadPublicViewerData(accessToken: unknown): Promise<PublicViewerData | null> {
  const school = await resolveGanttSchoolFromParam(accessToken);
  if (!school) return null;
  return unstable_cache(
    () => loadPublicViewerDataForSchool(school),
    ["public-viewer-data", school.slug],
    { revalidate: 5, tags: [getPublicViewerCacheTag(school.slug)] },
  )();
}

async function loadPublicViewerDataForSchool(school: PublicSchoolRecord): Promise<PublicViewerData> {
  const [eventTypes, gradeColors, events, eventSignature] = await Promise.all([
    listEventTypes(school.id),
    getGradeColors(school.id),
    getAgendaForSchool(school.id, {}),
    getAgendaSignatureForSchool(school.id, {}),
  ]);
  const year = buildCalendarRangeFromEvents(events);

  return {
    school,
    year,
    eventTypes,
    gradeColors,
    events: events.map(toPublicEventPayload),
    eventSignature,
  };
}

export async function loadPublicViewerEvents(accessToken: unknown): Promise<PublicViewerEvent[] | null> {
  const school = await resolveGanttSchoolFromParam(accessToken);
  if (!school) return null;
  return unstable_cache(
    async () => (await getAgendaForSchool(school.id, {})).map(toPublicEventPayload),
    ["public-viewer-events", school.slug],
    { revalidate: 5, tags: [getPublicViewerCacheTag(school.slug)] },
  )();
}

export async function loadPublicViewerEventSignature(accessToken: unknown): Promise<string | null> {
  const school = await resolveGanttSchoolFromParam(accessToken);
  if (!school) return null;

  return getAgendaSignatureForSchool(school.id, {});
}
