import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSchoolById } from "@/lib/db/schools";
import { hasService } from "@/lib/services";
import { getSubscriptionByToken } from "@/lib/ical/subscriptions";
import { listEventTypes } from "@/lib/events/queries";
import { getAgendaForSchool } from "@/lib/views/agenda";
import { serializeCalendar, type ICalEvent } from "@/lib/ical/serializer";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Public, token-gated iCalendar feed.
 *
 * PRD §11 contracts honored here:
 *   - 404 on revoked tokens within ~60 seconds (cache max-age=60).
 *   - response under 500 ms with up to 1 k events (single Postgres round
 *     trip via getAgendaForSchool, then in-memory serialization).
 *   - ETag from the rendered body so unchanged feeds short-circuit to 304.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { token } = await params;

  const subscription = await getSubscriptionByToken(token);
  if (!subscription) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A school without the Gantt service stops serving its staff's feeds.
  const schoolRow = await getSchoolById(subscription.schoolId);
  if (!schoolRow || !hasService(schoolRow, "gantt")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Subscription stores event-type *ids*, but getAgendaForSchool filters on
  // event-type *keys* (so labels can change without invalidating filters).
  const allTypes = await listEventTypes(subscription.schoolId);
  const typeIdToKey = new Map(allTypes.map((t) => [t.id, t.key]));
  const hasTypeFilter = subscription.filterEventTypes.length > 0;
  const filterKeys = subscription.filterEventTypes
    .map((id) => typeIdToKey.get(id))
    .filter((k): k is string => Boolean(k));

  const events = hasTypeFilter && filterKeys.length === 0
    ? []
    : await getAgendaForSchool(subscription.schoolId, {
        grades:
          subscription.filterGrades.length > 0 ? subscription.filterGrades : undefined,
        types: filterKeys.length > 0 ? filterKeys : undefined,
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
    // Row edit stamp (not now()) keeps the ETag stable while still changing
    // on edits, so subscribed calendars replace their cached copy.
    updatedAt: new Date(e.updatedAt ?? e.startAt),
    version: e.version ?? 1,
  }));

  const body = serializeCalendar({
    schoolName: schoolRow.name,
    schoolSlug: schoolRow.slug,
    events: ical,
  });

  const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${schoolRow.slug}.ics"`,
      ETag: etag,
      // 60 s cap keeps post-revocation lag ≤ 1 min (PRD §11).
      "Cache-Control": "public, max-age=60",
    },
  });
}

export const dynamic = "force-dynamic";
