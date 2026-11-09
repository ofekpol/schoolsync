import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { eventGrades, eventRevisions, events, staffEventDismissals } from "@/lib/db/schema";
import type { EventDraftInput, EventQuickPublishInput } from "@/lib/validations/events";

/**
 * Creates a new draft event row and returns its id + version.
 * The event row is created with status='draft' and version=1.
 * Must NOT be called inside another withSchool block (RESEARCH Pitfall 5).
 */
export async function createDraft(
  schoolId: string,
  createdBy: string,
  eventTypeId: string,
): Promise<{ id: string; version: number }> {
  const [row] = await withSchool(schoolId, (tx) =>
    tx
      .insert(events)
      .values({
        schoolId,
        createdBy,
        eventTypeId,
        title: "",
        startAt: new Date(),
        endAt: new Date(),
        status: "draft",
        version: 1,
      })
      .returning({ id: events.id, version: events.version }),
  );
  return { id: row.id, version: row.version };
}

/**
 * Creates a complete approved event in one school-scoped transaction.
 * Used by the dashboard quick-create path to avoid the draft -> patch -> submit
 * request chain while preserving the same final event/revision shape.
 */
export async function createPublishedEvent(
  schoolId: string,
  createdBy: string,
  input: EventQuickPublishInput,
): Promise<PublishedEventResult> {
  return withSchool(schoolId, (tx) => insertPublishedEvent(tx, schoolId, createdBy, input));
}

/** Publishes many events in one transaction: all land or none do (calendar import). */
export async function createPublishedEvents(
  schoolId: string,
  createdBy: string,
  inputs: EventQuickPublishInput[],
): Promise<PublishedEventResult[]> {
  return withSchool(schoolId, async (tx) => {
    const results: PublishedEventResult[] = [];
    for (const input of inputs) results.push(await insertPublishedEvent(tx, schoolId, createdBy, input));
    return results;
  });
}

type PublishedEventResult = { id: string; version: number; status: "approved" };
type SchoolTx = Parameters<Parameters<typeof withSchool>[1]>[0];

async function insertPublishedEvent(
  tx: SchoolTx,
  schoolId: string,
  createdBy: string,
  input: EventQuickPublishInput,
): Promise<PublishedEventResult> {
  const [event] = await tx
    .insert(events)
    .values({
      schoolId,
      createdBy,
      eventTypeId: input.eventTypeId,
      title: input.title,
      description: input.description,
      location: input.location,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      allDay: input.allDay ?? false,
      status: "approved",
      version: 1,
    })
    .returning({
      id: events.id,
      version: events.version,
      eventTypeId: events.eventTypeId,
      title: events.title,
      description: events.description,
      location: events.location,
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      status: events.status,
      createdBy: events.createdBy,
      updatedAt: events.updatedAt,
    });

  await tx.insert(eventGrades).values(
    input.grades.map((grade) => ({ eventId: event.id, grade, schoolId })),
  );

  await tx.insert(eventRevisions).values({
    eventId: event.id,
    schoolId,
    snapshot: event as unknown as Record<string, unknown>,
    decidedBy: createdBy,
    decision: "published",
  });

  return { id: event.id, version: event.version, status: "approved" as const };
}

export type UpdateDraftResult =
  | { status: "ok"; version: number }
  | { status: "conflict" }
  | { status: "not_found" };

/**
 * Atomically replaces the event_grades rows for an event with the given list.
 * Uses withSchool transaction so RLS is active and the delete+insert pair is atomic.
 * Empty grades array deletes all rows and inserts none.
 */
export async function replaceEventGrades(
  schoolId: string,
  eventId: string,
  grades: number[],
): Promise<void> {
  await withSchool(schoolId, async (tx) => {
    await tx.delete(eventGrades).where(eq(eventGrades.eventId, eventId));
    if (grades.length > 0) {
      await tx.insert(eventGrades).values(
        grades.map((grade) => ({ eventId, grade, schoolId })),
      );
    }
  });
}

type EventUpdate = {
  version: number;
  updatedAt: Date;
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  eventTypeId?: string;
};

/**
 * Updates allowed draft fields and optionally replaces the event_grades list atomically.
 * Enforces optimistic concurrency via expectedVersion (WIZARD-09).
 * Uses bulk-replace for grades: DELETE then INSERT within the same transaction (RESEARCH Pitfall 6).
 */
export async function updateDraft(
  schoolId: string,
  eventId: string,
  userId: string,
  isAdmin: boolean,
  fields: Partial<EventDraftInput>,
  expectedVersion: number | null,
): Promise<UpdateDraftResult> {
  const { grades, ...eventFields } = fields;

  const result = await withSchool(schoolId, async (tx) => {
    const [current] = await tx
      .select({
        version: events.version,
        createdBy: events.createdBy,
        status: events.status,
        title: events.title,
        description: events.description,
        location: events.location,
        startAt: events.startAt,
        endAt: events.endAt,
        allDay: events.allDay,
        eventTypeId: events.eventTypeId,
      })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!current) return { status: "not_found" as const };
    if (current.status === "canceled") {
      return { status: "not_found" as const };
    }
    if (!isAdmin && current.createdBy !== userId) {
      return { status: "not_found" as const };
    }

    // Optimistic concurrency check (WIZARD-09)
    if (expectedVersion !== null && current.version !== expectedVersion) {
      return { status: "conflict" as const };
    }

    const updateSet: EventUpdate = {
      version: current.version + 1,
      updatedAt: new Date(),
    };
    if (eventFields.title !== undefined) updateSet.title = eventFields.title;
    if (eventFields.description !== undefined) updateSet.description = eventFields.description;
    if (eventFields.location !== undefined) updateSet.location = eventFields.location;
    if (eventFields.startAt !== undefined) updateSet.startAt = new Date(eventFields.startAt);
    if (eventFields.endAt !== undefined) updateSet.endAt = new Date(eventFields.endAt);
    if (eventFields.allDay !== undefined) updateSet.allDay = eventFields.allDay;
    if (eventFields.eventTypeId !== undefined) updateSet.eventTypeId = eventFields.eventTypeId;

    const [updated] = await tx
      .update(events)
      .set(updateSet)
      .where(eq(events.id, eventId))
      .returning({ version: events.version });

    if (current.status === "approved") {
      await tx.insert(eventRevisions).values({
        eventId,
        schoolId,
        snapshot: current as unknown as Record<string, unknown>,
        submittedBy: userId,
        decision: "edited",
      });
    }

    return { status: "ok" as const, version: updated.version };
  });

  // Replace grades after the event update transaction completes.
  // replaceEventGrades opens its own withSchool — nesting is not allowed (Pitfall 5).
  if (result.status === "ok" && grades !== undefined) {
    await replaceEventGrades(schoolId, eventId, grades);
  }

  return result;
}

/**
 * Deletes drafts by hiding them, but keeps published events visible as canceled.
 * Canceled published events remain in public views so viewers know the event
 * was planned and then called off.
 */
export async function deleteOrCancelEvent(
  schoolId: string,
  eventId: string,
  userId: string,
  isAdmin: boolean,
): Promise<{ status: "deleted" | "canceled" | "not_found" }> {
  const result = await withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!row) return "not_found" as const;
    if (!isAdmin && row.createdBy !== userId) return "not_found" as const;
    if (row.status === "canceled") return "not_found" as const;

    if (row.status === "approved") {
      await tx
        .update(events)
        .set({ status: "canceled", updatedAt: new Date(), version: row.version + 1 })
        .where(eq(events.id, eventId));

      await tx.insert(eventRevisions).values({
        eventId,
        schoolId,
        snapshot: row as unknown as Record<string, unknown>,
        submittedBy: userId,
        decidedBy: userId,
        decision: "canceled",
      });

      return "canceled" as const;
    }

    await tx.update(events).set({ deletedAt: new Date() }).where(eq(events.id, eventId));
    return "deleted" as const;
  });

  return { status: result };
}

export async function dismissCanceledEventForStaff(
  schoolId: string,
  eventId: string,
  staffUserId: string,
): Promise<{ status: "dismissed" | "not_found" }> {
  const result = await withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .select({ id: events.id, status: events.status })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!row || row.status !== "canceled") return "not_found" as const;

    await tx
      .insert(staffEventDismissals)
      .values({ schoolId, staffUserId, eventId })
      .onConflictDoNothing({
        target: [staffEventDismissals.staffUserId, staffEventDismissals.eventId],
      });

    return "dismissed" as const;
  });

  return { status: result };
}
