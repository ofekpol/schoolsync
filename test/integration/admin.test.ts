import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createEventType,
  updateEventType,
  deleteEventType,
  listEventTypes,
  reorderEventTypes,
} from "@/lib/admin/event-types";
import {
  createStaffUserFromInvite,
  updateStaffUser,
  listStaffUsers,
} from "@/lib/db/staff";
import { testDb, skipIfNoTestDb, shouldSkip, testSchoolA, testSchoolB } from "./setup";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN-01: Staff management
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "ADMIN-01: admin manages staff users",
  () => {
    let staffId: string;
    let staffBId: string;

    beforeAll(async () => {
      if (shouldSkip()) return;
      staffId = randomUUID();
      await createStaffUserFromInvite({
        authUserId: staffId,
        schoolId: testSchoolA,
        email: `admin01-editor-${staffId}@test`,
        fullName: "Initial Name",
        role: "editor",
      });
      // Staff user in school B (to verify cross-school isolation)
      staffBId = randomUUID();
      await createStaffUserFromInvite({
        authUserId: staffBId,
        schoolId: testSchoolB,
        email: `admin01-editor-b-${staffBId}@test`,
        fullName: "School B Editor",
        role: "editor",
      });
    });

    it("createStaffUserFromInvite creates a user with the correct role", async () => {
      const [row] = await testDb!
        .select({ role: schema.staffUsers.role })
        .from(schema.staffUsers)
        .where(eq(schema.staffUsers.id, staffId));
      expect(row.role).toBe("editor");
    });

    it("createStaffUserFromInvite can create an admin-role user", async () => {
      const adminId = randomUUID();
      await createStaffUserFromInvite({
        authUserId: adminId,
        schoolId: testSchoolA,
        email: `admin01-admin-${adminId}@test`,
        fullName: "Test Admin",
        role: "admin",
      });
      const [row] = await testDb!
        .select({ role: schema.staffUsers.role })
        .from(schema.staffUsers)
        .where(eq(schema.staffUsers.id, adminId));
      expect(row.role).toBe("admin");
    });

    it("listStaffUsers includes the created staff member", async () => {
      const users = await listStaffUsers(testSchoolA);
      expect(users.map((u) => u.id)).toContain(staffId);
    });

    it("updateStaffUser updates fullName", async () => {
      await updateStaffUser(testSchoolA, staffId, { fullName: "Updated Name" });
      const [row] = await testDb!
        .select({ fullName: schema.staffUsers.fullName })
        .from(schema.staffUsers)
        .where(eq(schema.staffUsers.id, staffId));
      expect(row.fullName).toBe("Updated Name");
    });

    it("updateStaffUser updates role from editor to admin", async () => {
      await updateStaffUser(testSchoolA, staffId, { role: "admin" });
      const [row] = await testDb!
        .select({ role: schema.staffUsers.role })
        .from(schema.staffUsers)
        .where(eq(schema.staffUsers.id, staffId));
      expect(row.role).toBe("admin");
    });

    it("listStaffUsers does not include staff from another school", async () => {
      const users = await listStaffUsers(testSchoolA);
      expect(users.map((u) => u.id)).not.toContain(staffBId);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN-02: Event-type CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoTestDb)(
  "ADMIN-02: admin configures event types",
  () => {
    let etId: string;
    const uniqueKey = `test-et-${randomUUID().slice(0, 8)}`;

    beforeAll(async () => {
      if (shouldSkip()) return;
      const result = await createEventType(testSchoolA, {
        key: uniqueKey,
        labelHe: "בדיקה",
        labelEn: "Test",
        colorHex: "#123456",
        glyph: "X",
      });
      etId = result.id;
    });

    it("createEventType returns a valid id", async () => {
      expect(typeof etId).toBe("string");
      expect(etId.length).toBeGreaterThan(0);
    });

    it("createEventType persists the row with correct fields", async () => {
      const [row] = await testDb!
        .select()
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.id, etId));
      expect(row.key).toBe(uniqueKey);
      expect(row.labelHe).toBe("בדיקה");
      expect(row.labelEn).toBe("Test");
      expect(row.colorHex).toBe("#123456");
      expect(row.glyph).toBe("X");
    });

    it("updateEventType updates labelHe, returns {updated: true}", async () => {
      const result = await updateEventType(testSchoolA, etId, {
        labelHe: "עדכון",
      });
      expect(result).toEqual({ updated: true });
      const [row] = await testDb!
        .select({ labelHe: schema.eventTypes.labelHe })
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.id, etId));
      expect(row.labelHe).toBe("עדכון");
    });

    it("updateEventType on a non-existent id returns {updated: false}", async () => {
      const result = await updateEventType(testSchoolA, randomUUID(), { labelEn: "Ghost" });
      expect(result).toEqual({ updated: false });
    });

    it("listEventTypes returns school A's types in display (sort_order) order", async () => {
      const types = await listEventTypes(testSchoolA);
      expect(types.length).toBeGreaterThan(0);
      const rows = await testDb!
        .select({ id: schema.eventTypes.id, sortOrder: schema.eventTypes.sortOrder })
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.schoolId, testSchoolA));
      const order = new Map(rows.map((r) => [r.id, r.sortOrder]));
      for (let i = 1; i < types.length; i++) {
        expect(order.get(types[i].id)!).toBeGreaterThanOrEqual(order.get(types[i - 1].id)!);
      }
    });

    it("createEventType without a key derives a unique one and appends to the order", async () => {
      const first = await createEventType(testSchoolA, {
        labelHe: "סיור", labelEn: "Field Visit!", colorHex: "#111111", glyph: "F",
      });
      const second = await createEventType(testSchoolA, {
        labelHe: "סיור 2", labelEn: "Field Visit", colorHex: "#222222", glyph: "F",
      });
      expect(first.key).toMatch(/^field_visit(_\d+)?$/);
      expect(second.key).not.toBe(first.key);
      const types = await listEventTypes(testSchoolA);
      expect(types.at(-1)!.id).toBe(second.id);
      await deleteEventType(testSchoolA, first.id);
      await deleteEventType(testSchoolA, second.id);
    });

    it("reorderEventTypes applies the given order and rejects a partial or foreign list", async () => {
      const ids = (await listEventTypes(testSchoolA)).map((t) => t.id);
      const reversed = ids.slice().reverse();
      expect(await reorderEventTypes(testSchoolA, reversed)).toEqual({ reordered: true });
      expect((await listEventTypes(testSchoolA)).map((t) => t.id)).toEqual(reversed);
      expect(await reorderEventTypes(testSchoolA, ids.slice(1))).toEqual({ reordered: false });
      const [schoolBType] = await testDb!
        .select({ id: schema.eventTypes.id })
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.schoolId, testSchoolB))
        .limit(1);
      expect(
        await reorderEventTypes(testSchoolA, [...ids.slice(1), schoolBType.id]),
      ).toEqual({ reordered: false });
      expect(await reorderEventTypes(testSchoolA, ids)).toEqual({ reordered: true });
    });

    it("cross-school: updateEventType from school A on school B's event type returns {updated: false}", async () => {
      const [schoolBType] = await testDb!
        .select({ id: schema.eventTypes.id })
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.schoolId, testSchoolB))
        .limit(1);
      const result = await updateEventType(testSchoolA, schoolBType.id, { labelEn: "Hack" });
      expect(result).toEqual({ updated: false });
    });

    it("cross-school: deleteEventType from school A on school B's event type returns {deleted: false}", async () => {
      const [schoolBType] = await testDb!
        .select({ id: schema.eventTypes.id })
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.schoolId, testSchoolB))
        .limit(1);
      const result = await deleteEventType(testSchoolA, schoolBType.id);
      expect(result).toEqual({ deleted: false });
    });

    it("event type key must be unique per school — duplicate key throws", async () => {
      await expect(
        createEventType(testSchoolA, {
          key: uniqueKey, // same key as the one created in beforeAll
          labelHe: "כפול",
          labelEn: "Duplicate",
          colorHex: "#ffffff",
          glyph: "D",
        }),
      ).rejects.toThrow();
    });

    it("deleteEventType returns {deleted: true} and removes the row", async () => {
      const { id } = await createEventType(testSchoolA, {
        key: `del-${randomUUID().slice(0, 8)}`,
        labelHe: "למחיקה",
        labelEn: "To Delete",
        colorHex: "#abcdef",
        glyph: "Z",
      });
      expect(await deleteEventType(testSchoolA, id)).toEqual({ deleted: true });
      expect(await deleteEventType(testSchoolA, id)).toEqual({ deleted: false });
    });
  },
);
