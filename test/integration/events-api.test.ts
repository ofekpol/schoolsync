import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createDraft,
  createPublishedEvent,
  deleteOrCancelEvent,
  replaceEventGrades,
  updateDraft,
} from "@/lib/events/crud";
import { getEditorDashboardEvents, getEventForEditor } from "@/lib/events/queries";
import { testDb, skipIfNoTestDb, shouldSkip, testSchoolA, testSchoolB } from "./setup";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function ensureEditor(
  schoolId: string,
  email: string,
  role: "editor" | "admin" = "editor",
) {
  const existing = await testDb!
    .select()
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.email, email))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [row] = await testDb!
    .insert(schema.staffUsers)
    .values({ id: randomUUID(), schoolId, email, fullName: email, role })
    .returning();
  return row;
}

async function firstEventType(schoolId: string): Promise<string> {
  const [t] = await testDb!
    .select({ id: schema.eventTypes.id })
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.schoolId, schoolId))
    .limit(1);
  return t.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS-CRUD-01: createDraft
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "EVENTS-CRUD-01: createDraft — persists draft row",
  () => {
    let editorId: string;
    let eventTypeId: string;

    beforeAll(async () => {
      if (shouldSkip()) return;
      editorId = (await ensureEditor(testSchoolA, "crud-create@test")).id;
      eventTypeId = await firstEventType(testSchoolA);
    });

    it("returns {id, version: 1}", async () => {
      const result = await createDraft(testSchoolA, editorId, eventTypeId);
      expect(typeof result.id).toBe("string");
      expect(result.version).toBe(1);
    });

    it("persists a row with status=draft and correct schoolId", async () => {
      const { id } = await createDraft(testSchoolA, editorId, eventTypeId);
      const [row] = await testDb!
        .select({ status: schema.events.status, schoolId: schema.events.schoolId })
        .from(schema.events)
        .where(eq(schema.events.id, id));
      expect(row.status).toBe("draft");
      expect(row.schoolId).toBe(testSchoolA);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS-CRUD-02: getEventForEditor — shape, ownership, camelCase
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "EVENTS-CRUD-02: getEventForEditor — response shape and ownership",
  () => {
    let ownerEditorId: string;
    let otherEditorId: string;
    let adminId: string;
    let eventTypeId: string;

    beforeAll(async () => {
      if (shouldSkip()) return;
      ownerEditorId = (await ensureEditor(testSchoolA, "qry-owner@test")).id;
      otherEditorId = (await ensureEditor(testSchoolA, "qry-other@test")).id;
      adminId = (await ensureEditor(testSchoolA, "qry-admin@test", "admin")).id;
      eventTypeId = await firstEventType(testSchoolA);
    });

    it("returns null when the event does not exist", async () => {
      const r = await getEventForEditor(testSchoolA, randomUUID(), ownerEditorId, false);
      expect(r).toBeNull();
    });

    it("returns null when a non-admin caller is not the event owner", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      const r = await getEventForEditor(testSchoolA, id, otherEditorId, false);
      expect(r).toBeNull();
    });

    it("owner can retrieve their own event", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      const r = await getEventForEditor(testSchoolA, id, ownerEditorId, false);
      expect(r).not.toBeNull();
      expect(r?.event.id).toBe(id);
    });

    it("admin can retrieve an event they do not own", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      const r = await getEventForEditor(testSchoolA, id, adminId, true);
      expect(r).not.toBeNull();
    });

    it("returns grades as a number array", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      await replaceEventGrades(testSchoolA, id, [7, 11]);
      const r = await getEventForEditor(testSchoolA, id, ownerEditorId, false);
      expect([...(r?.grades ?? [])].sort((a, b) => a - b)).toEqual([7, 11]);
    });

    it("returns empty grades array when no grades are assigned", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      const r = await getEventForEditor(testSchoolA, id, ownerEditorId, false);
      expect(r?.grades).toEqual([]);
    });

    it("event object uses camelCase field names (eventTypeId, createdBy, updatedAt)", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      const r = await getEventForEditor(testSchoolA, id, ownerEditorId, false);
      const event = r?.event as Record<string, unknown>;
      expect(event).toHaveProperty("eventTypeId");
      expect(event).toHaveProperty("createdBy");
      expect(event).toHaveProperty("updatedAt");
      expect(event).not.toHaveProperty("event_type_id");
      expect(event).not.toHaveProperty("created_by");
      expect(event).not.toHaveProperty("updated_at");
    });

    it("returns null for a soft-deleted event", async () => {
      const { id } = await createDraft(testSchoolA, ownerEditorId, eventTypeId);
      await deleteOrCancelEvent(testSchoolA, id, ownerEditorId, false);
      const r = await getEventForEditor(testSchoolA, id, ownerEditorId, false);
      expect(r).toBeNull();
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS-CRUD-03: cross-school RLS
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "EVENTS-CRUD-03: cross-school RLS — school A cannot touch school B events",
  () => {
    let editorA: string;
    let editorB: string;
    let schoolBEventId: string;

    beforeAll(async () => {
      if (shouldSkip()) return;
      editorA = (await ensureEditor(testSchoolA, "rls-editor-a@test")).id;
      editorB = (await ensureEditor(testSchoolB, "rls-editor-b@test")).id;
      const etB = await firstEventType(testSchoolB);
      const { id } = await createDraft(testSchoolB, editorB, etB);
      schoolBEventId = id;
    });

    it("getEventForEditor with school A context returns null for school B's event", async () => {
      const r = await getEventForEditor(testSchoolA, schoolBEventId, editorA, false);
      expect(r).toBeNull();
    });

    it("updateDraft with school A context returns not_found for school B's event", async () => {
      const r = await updateDraft(
        testSchoolA,
        schoolBEventId,
        editorA,
        false,
        { title: "cross-school hack" },
        null,
      );
      expect(r.status).toBe("not_found");
    });

    it("deleteOrCancelEvent with school A context returns not_found for school B's event", async () => {
      const r = await deleteOrCancelEvent(testSchoolA, schoolBEventId, editorA, true);
      expect(r).toEqual({ status: "not_found" });
    });

    it("getEditorDashboardEvents does not leak events from the other school", async () => {
      const events = await getEditorDashboardEvents(testSchoolA, editorA);
      const ids = events.map((e) => e.id);
      expect(ids).not.toContain(schoolBEventId);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS-CRUD-04: getEditorDashboardEvents
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "EVENTS-CRUD-04: getEditorDashboardEvents — filtering and shape",
  () => {
    let editorA: string;
    let editorB: string;
    let eventTypeId: string;

    beforeAll(async () => {
      if (shouldSkip()) return;
      editorA = (await ensureEditor(testSchoolA, "dash-editor-a@test")).id;
      editorB = (await ensureEditor(testSchoolA, "dash-editor-b@test")).id;
      eventTypeId = await firstEventType(testSchoolA);
    });

    it("includes events owned by the calling editor", async () => {
      const { id } = await createDraft(testSchoolA, editorA, eventTypeId);
      const events = await getEditorDashboardEvents(testSchoolA, editorA);
      expect(events.map((e) => e.id)).toContain(id);
    });

    it("does not include events owned by a different editor", async () => {
      const { id: idB } = await createDraft(testSchoolA, editorB, eventTypeId);
      const events = await getEditorDashboardEvents(testSchoolA, editorA);
      expect(events.map((e) => e.id)).not.toContain(idB);
    });

    it("excludes soft-deleted events", async () => {
      const { id } = await createDraft(testSchoolA, editorA, eventTypeId);
      await deleteOrCancelEvent(testSchoolA, id, editorA, false);
      const events = await getEditorDashboardEvents(testSchoolA, editorA);
      expect(events.map((e) => e.id)).not.toContain(id);
    });

    it("returns camelCase field names (eventTypeId, updatedAt)", async () => {
      const { id } = await createDraft(testSchoolA, editorA, eventTypeId);
      const events = await getEditorDashboardEvents(testSchoolA, editorA);
      const event = events.find((e) => e.id === id) as Record<string, unknown> | undefined;
      expect(event).toBeDefined();
      expect(event).toHaveProperty("eventTypeId");
      expect(event).toHaveProperty("updatedAt");
      expect(event).not.toHaveProperty("event_type_id");
      expect(event).not.toHaveProperty("updated_at");
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS-CRUD-05: createPublishedEvent one-step quick publish
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "EVENTS-CRUD-05: createPublishedEvent — one-step approved event",
  () => {
    let editorId: string;
    let eventTypeId: string;

    beforeAll(async () => {
      if (shouldSkip()) return;
      editorId = (await ensureEditor(testSchoolA, "quick-publish@test")).id;
      eventTypeId = await firstEventType(testSchoolA);
    });

    it("creates an approved event with grades", async () => {
      const result = await createPublishedEvent(testSchoolA, editorId, {
        title: "Quick event",
        eventTypeId,
        grades: [8, 10],
        startAt: "2031-02-03T08:00:00+02:00",
        endAt: "2031-02-03T09:00:00+02:00",
        allDay: false,
        description: "Details",
        location: "Gym",
      });

      expect(result.status).toBe("approved");
      const row = await getEventForEditor(testSchoolA, result.id, editorId, false);
      expect(row?.event.status).toBe("approved");
      expect(row?.event.title).toBe("Quick event");
      expect([...(row?.grades ?? [])].sort((a, b) => a - b)).toEqual([8, 10]);
    });

    it("writes a published revision row", async () => {
      const result = await createPublishedEvent(testSchoolA, editorId, {
        title: "Quick revision event",
        eventTypeId,
        grades: [9],
        startAt: "2031-02-04T08:00:00+02:00",
        endAt: "2031-02-04T09:00:00+02:00",
      });

      const revs = await testDb!
        .select({ decision: schema.eventRevisions.decision })
        .from(schema.eventRevisions)
        .where(eq(schema.eventRevisions.eventId, result.id));
      expect(revs).toHaveLength(1);
      expect(revs[0].decision).toBe("published");
    });
  },
);
