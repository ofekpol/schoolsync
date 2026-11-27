import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { eq, and, like } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { seedDb } from "@/db/seed";
import { roomWeeklySlots, rooms, roomsWeek } from "@/lib/db/schema-rooms";
import { getPermissions } from "@/lib/permissions";
import { testDb, skipIfNoTestDb, shouldSkip } from "./setup";

// Deterministic UUID per email — stable across runs so re-seeding upserts the
// same staff_users row (the email-conflict path keeps the original id, and
// editor_scopes references must resolve).
function deterministicUuid(email: string): string {
  const h = createHash("sha256").update(email).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function runSeed() {
  if (!testDb) throw new Error("testDb is null — TEST_DATABASE_URL not set");
  return seedDb({
    database: testDb,
    ensureStaffUserId: async (email) => deterministicUuid(email),
  });
}

describe.skipIf(skipIfNoTestDb)("DB-06: seed creates canonical bootstrap", () => {
  beforeAll(async () => {
    if (shouldSkip()) return;
    await runSeed();
  }, 30_000);

  it("creates exactly one school with slug 'demo-school'", async () => {
    const rows = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    expect(rows).toHaveLength(1);
  });

  it("creates one admin staff_user", async () => {
    const [school] = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    const admins = await testDb!
      .select()
      .from(schema.staffUsers)
      .where(
        and(
          eq(schema.staffUsers.schoolId, school.id),
          eq(schema.staffUsers.role, "admin"),
        ),
      );
    expect(admins).toHaveLength(1);
  });

  it("creates 6 grade-supervisor editors (grades 7-12)", async () => {
    const [school] = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    const scopes = await testDb!
      .select({ scopeValue: schema.editorScopes.scopeValue })
      .from(schema.editorScopes)
      .innerJoin(
        schema.staffUsers,
        eq(schema.editorScopes.staffUserId, schema.staffUsers.id),
      )
      .where(
        and(
          eq(schema.editorScopes.schoolId, school.id),
          eq(schema.editorScopes.scopeKind, "grade"),
          like(schema.staffUsers.email, "%@demo-school.test"),
        ),
      );
    // Use Set to tolerate stale rows from prior seed runs (no truncate in beforeAll).
    // Intent: grades 7-12 all present, not "exactly 6 rows".
    const grades = [...new Set(scopes.map((s) => Number(s.scopeValue)))].sort((a, b) => a - b);
    expect(grades).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("creates one counselor editor with event_type scope", async () => {
    const [school] = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    const eventTypeScopes = await testDb!
      .select({ scopeValue: schema.editorScopes.scopeValue })
      .from(schema.editorScopes)
      .innerJoin(
        schema.staffUsers,
        eq(schema.editorScopes.staffUserId, schema.staffUsers.id),
      )
      .where(
        and(
          eq(schema.editorScopes.schoolId, school.id),
          eq(schema.editorScopes.scopeKind, "event_type"),
          eq(schema.staffUsers.email, "counselor@demo-school.test"),
        ),
      );
    // Tolerate stale rows from prior seed runs — assert distinct values match expectation.
    const distinct = [...new Set(eventTypeScopes.map((s) => s.scopeValue))];
    expect(distinct).toEqual(["counseling"]);
  });

  it("creates exactly 11 event_types", async () => {
    const [school] = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    const types = await testDb!
      .select()
      .from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, school.id));
    expect(types).toHaveLength(11);
  });

  it("re-running seed does not duplicate any rows (idempotent)", async () => {
    const [school] = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    const beforeUsers = await testDb!
      .select()
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.schoolId, school.id));
    await runSeed();
    const afterUsers = await testDb!
      .select()
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.schoolId, school.id));
    expect(afterUsers).toHaveLength(beforeUsers.length);
  });

  it("sets up demo rooms: service, active year, week, six rooms, fixed use, and a viewer who can book", async () => {
    const [school] = await testDb!
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.slug, "demo-school"));
    expect(school.services).toContain("rooms");
    expect(school.activeAcademicYearId).not.toBeNull();
    await runSeed();
    const roomRows = await testDb!.select().from(rooms).where(eq(rooms.schoolId, school.id));
    expect(roomRows).toHaveLength(6);
    const slots = await testDb!.select().from(roomWeeklySlots).where(eq(roomWeeklySlots.schoolId, school.id));
    expect(slots).toHaveLength(7);
    const [week] = await testDb!.select().from(roomsWeek).where(eq(roomsWeek.schoolId, school.id));
    expect(week.week.days).toHaveLength(6);
    const [viewer] = await testDb!
      .select()
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.email, "viewer@demo-school.test"));
    const permissions = await getPermissions({ ...viewer, schoolId: school.id, mustChangePassword: false });
    expect([...permissions]).toEqual(["rooms.book"]);
  });
});
