import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import {
  editorScopes,
  eventGrades,
  events,
  eventTypes,
} from "@/lib/db/schema";

/**
 * Returns grade numbers the editor is allowed to assign.
 * If the editor has zero grade-kind scopes (e.g. department editor),
 * returns all grades 7–12 per RESEARCH Open Question 4.
 */
export async function getEditorAllowedGrades(
  schoolId: string,
  staffUserId: string,
): Promise<number[]> {
  const rows = await withSchool(schoolId, (tx) =>
    tx
      .select({ scopeValue: editorScopes.scopeValue })
      .from(editorScopes)
      .where(
        and(
          eq(editorScopes.staffUserId, staffUserId),
          eq(editorScopes.scopeKind, "grade"),
        ),
      ),
  );
  if (rows.length === 0) return [7, 8, 9, 10, 11, 12];
  return rows.map((r) => Number(r.scopeValue));
}

/**
 * Whether `user` may use `eventTypeId`. Admins may use every type. Mirrors the
 * grade rule: an editor with zero event_type scopes may use every type;
 * otherwise the type's key must be one of their scope values.
 */
export async function isEventTypeAllowed(
  user: { id: string; schoolId: string | null; role: string },
  eventTypeId: string,
): Promise<boolean> {
  if (!user.schoolId) return false;
  const staffUserId = user.id;
  return withSchool(user.schoolId, async (tx) => {
    // RLS only shows this school's types, so this also refuses another school's id —
    // for admins too (the events FK on event_type_id is not tenant-scoped).
    const [type] = await tx
      .select({ key: eventTypes.key })
      .from(eventTypes)
      .where(eq(eventTypes.id, eventTypeId))
      .limit(1);
    if (!type) return false;
    if (user.role === "admin") return true;

    const scopeRows = await tx
      .select({ scopeValue: editorScopes.scopeValue })
      .from(editorScopes)
      .where(
        and(
          eq(editorScopes.staffUserId, staffUserId),
          eq(editorScopes.scopeKind, "event_type"),
        ),
      );
    return scopeRows.length === 0 || scopeRows.some((row) => row.scopeValue === type.key);
  });
}

export interface DashboardEvent {
  id: string;
  title: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "canceled";
  updatedAt: Date;
  startAt: Date | null;
  endAt: Date | null;
  eventTypeId: string;
}

/**
 * Returns the calling editor's non-deleted draft and approved events,
 * ordered most-recently-updated first.
 */
export async function getEditorDashboardEvents(
  schoolId: string,
  staffUserId: string,
): Promise<DashboardEvent[]> {
  return withSchool(schoolId, (tx) =>
    tx
      .select({
        id: events.id,
        title: events.title,
        status: events.status,
        updatedAt: events.updatedAt,
        startAt: events.startAt,
        endAt: events.endAt,
        eventTypeId: events.eventTypeId,
      })
      .from(events)
      .where(
        and(
          eq(events.createdBy, staffUserId),
          inArray(events.status, ["draft", "approved"]),
          isNull(events.deletedAt),
        ),
      )
      .orderBy(desc(events.updatedAt)),
  ) as Promise<DashboardEvent[]>;
}

export interface EventWithGrades {
  event: {
    id: string;
    title: string | null;
    description: string | null;
    location: string | null;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    status: "draft" | "pending" | "approved" | "rejected" | "canceled";
    version: number;
    eventTypeId: string;
    createdBy: string;
    updatedAt: Date;
  };
  grades: number[];
}

/**
 * Returns a single event with its grade list for an editor or admin.
 * Returns null when: not found, soft-deleted, cross-school (RLS), or
 * caller is not the owner and not admin.
 */
export async function getEventForEditor(
  schoolId: string,
  eventId: string,
  staffUserId: string,
  isAdmin: boolean,
): Promise<EventWithGrades | null> {
  const result = await withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        location: events.location,
        startAt: events.startAt,
        endAt: events.endAt,
        allDay: events.allDay,
        status: events.status,
        version: events.version,
        eventTypeId: events.eventTypeId,
        createdBy: events.createdBy,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!row) return null;
    if (!isAdmin && row.createdBy !== staffUserId) return null;

    const gradeRows = await tx
      .select({ grade: eventGrades.grade })
      .from(eventGrades)
      .where(eq(eventGrades.eventId, eventId));

    return { event: row, grades: gradeRows.map((g) => g.grade) };
  });

  return result;
}

/**
 * Returns the lowest-sortOrder event_type for the school, or null if none exist.
 * Used by the wizard entry page to pick a default event type without raw
 * schema imports outside lib/.
 */
export async function getDefaultEventType(
  schoolId: string,
): Promise<{ id: string } | null> {
  const [row] = await withSchool(schoolId, (tx) =>
    tx
      .select({ id: eventTypes.id })
      .from(eventTypes)
      .orderBy(asc(eventTypes.sortOrder))
      .limit(1),
  );
  return row ?? null;
}

export interface EventTypeListItem {
  id: string;
  key: string;
  labelHe: string;
  labelEn: string;
  colorHex: string;
  glyph: string;
  sortOrder: number;
}

/**
 * Returns the school's event-type palette ordered by sortOrder.
 * Used by the wizard entry page so Step 3 can render the full chip list.
 */
export async function listEventTypes(
  schoolId: string,
): Promise<EventTypeListItem[]> {
  return withSchool(schoolId, (tx) =>
    tx
      .select({
        id: eventTypes.id,
        key: eventTypes.key,
        labelHe: eventTypes.labelHe,
        labelEn: eventTypes.labelEn,
        colorHex: eventTypes.colorHex,
        glyph: eventTypes.glyph,
        sortOrder: eventTypes.sortOrder,
      })
      .from(eventTypes)
      .orderBy(asc(eventTypes.sortOrder)),
  );
}

/**
 * Returns the calling editor's draft row by id, or null when not owned or not found.
 * Excludes soft-deleted rows.
 */
export async function getDraftForResume(
  schoolId: string,
  eventId: string,
  staffUserId: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await withSchool(schoolId, (tx) =>
    tx
      .select()
      .from(events)
      .where(
        and(
          eq(events.id, eventId),
          eq(events.createdBy, staffUserId),
          isNull(events.deletedAt),
        ),
      )
      .limit(1),
  );
  return (row as Record<string, unknown>) ?? null;
}
