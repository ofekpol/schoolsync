import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { withSchool } from "@/lib/db/client";
import {
  DEMO_GLOBAL_PER_DAY,
  cleanupExpiredDemos,
  createDemoSchool,
  deleteDemoSchool,
  getDemoStaffUser,
  reserveDemoSlot,
} from "@/lib/db/demo";
import { demoEvents } from "@/db/demo-events";
import { demoLimitResponse } from "@/lib/auth/demo-guard";
import { isEventTypeAllowed } from "@/lib/events/queries";
import { testDb, skipIfNoTestDb, shouldSkip, testSchoolA } from "./setup";

const created: string[] = [];

async function newDemo() {
  const demo = await createDemoSchool();
  created.push(demo.schoolId);
  return demo;
}

async function rowCount(table: string, schoolId: string): Promise<number> {
  const { rows } = await testDb!.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where school_id = ${schoolId}`,
  );
  return (rows[0] as { n: number }).n;
}

async function expectLimit(promise: Promise<unknown>, status: number, error: string) {
  const failure = await promise.then(() => null, (e: unknown) => e);
  expect(failure).not.toBeNull();
  const response = demoLimitResponse(failure);
  expect(response?.status).toBe(status);
  await expect(response?.json()).resolves.toEqual({ error });
}

function eventRow(schoolId: string, eventTypeId: string, createdBy: string, title = "x") {
  return {
    schoolId, eventTypeId, createdBy, title,
    startAt: new Date("2026-12-01T08:00:00Z"), endAt: new Date("2026-12-01T09:00:00Z"),
    status: "approved" as const,
  };
}

afterAll(async () => {
  if (shouldSkip()) return;
  for (const id of created) await deleteDemoSchool(id);
  await testDb!.delete(schema.demoCreations);
});

describe.skipIf(skipIfNoTestDb)("DEMO: create, resolve and isolate", () => {
  it("creates a filled demo school with one admin and no Auth user", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const [school] = await testDb!.select().from(schema.schools).where(eq(schema.schools.id, demo.schoolId));
    expect(school.demoExpiresAt?.getTime()).toBe(demo.expiresAt.getTime());
    expect(school.slug).toMatch(/^demo-[0-9a-f]{12}$/);
    expect(school.activeAcademicYearId).not.toBeNull();
    expect(await rowCount("event_types", demo.schoolId)).toBe(11);
    expect(await rowCount("events", demo.schoolId)).toBe(demoEvents().length);
    const staff = await testDb!.select().from(schema.staffUsers).where(eq(schema.staffUsers.schoolId, demo.schoolId));
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({ id: demo.staffId, role: "admin", status: "active", mustChangePassword: false });
    expect(staff[0].email).toMatch(/@demo\.edusolutions\.invalid$/);
  });

  it("resolves a demo session only for its own live demo school", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const user = await getDemoStaffUser(demo.staffId, demo.schoolId);
    expect(user).toMatchObject({ id: demo.staffId, schoolId: demo.schoolId, role: "admin" });
    expect(user?.demoExpiresAt).toBeInstanceOf(Date);
    expect(await getDemoStaffUser(demo.staffId, testSchoolA)).toBeNull();
    await testDb!.update(schema.schools).set({ demoExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.schools.id, demo.schoolId));
    expect(await getDemoStaffUser(demo.staffId, demo.schoolId)).toBeNull();
  });

  it("never resolves a demo session that names a real school's staff", async () => {
    if (shouldSkip()) return;
    const [realStaff] = await testDb!.select({ id: schema.staffUsers.id }).from(schema.staffUsers)
      .where(eq(schema.staffUsers.schoolId, testSchoolA)).limit(1);
    if (!realStaff) return;
    expect(await getDemoStaffUser(realStaff.id, testSchoolA)).toBeNull();
  });

  it("keeps a demo admin out of other schools' rows and event types", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const foreign = await withSchool(demo.schoolId, (tx) =>
      tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.schoolId, testSchoolA)));
    expect(foreign).toEqual([]);
    const [typeA] = await testDb!.select({ id: schema.eventTypes.id }).from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, testSchoolA)).limit(1);
    if (typeA) {
      const admin = { id: demo.staffId, schoolId: demo.schoolId, role: "admin" };
      expect(await isEventTypeAllowed(admin, typeA.id)).toBe(false);
    }
  });
});

describe.skipIf(skipIfNoTestDb)("DEMO: deletion and cleanup", () => {
  it("deletes every row a demo owns and refuses a real school", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    await deleteDemoSchool(demo.schoolId);
    const { rows } = await testDb!.execute(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'school_id'`);
    for (const { table_name } of rows as { table_name: string }[]) {
      expect(await rowCount(table_name, demo.schoolId), table_name).toBe(0);
    }
    expect(await testDb!.select().from(schema.schools).where(eq(schema.schools.id, demo.schoolId))).toEqual([]);
    await deleteDemoSchool(demo.schoolId); // idempotent
    await expect(deleteDemoSchool(testSchoolA)).rejects.toThrow(/non-demo/);
    expect(await testDb!.select().from(schema.schools).where(eq(schema.schools.id, testSchoolA))).toHaveLength(1);
  });

  it("cleans up only expired demos and prunes day-old ledger rows", async () => {
    if (shouldSkip()) return;
    const expired = await newDemo();
    const live = await newDemo();
    await testDb!.update(schema.schools).set({ demoExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.schools.id, expired.schoolId));
    await testDb!.insert(schema.demoCreations).values({ ipHash: "old", createdAt: new Date(Date.now() - 2 * 86_400_000) });
    expect(await cleanupExpiredDemos(100)).toBeGreaterThanOrEqual(1);
    expect(await testDb!.select().from(schema.schools).where(eq(schema.schools.id, expired.schoolId))).toEqual([]);
    expect(await testDb!.select().from(schema.schools).where(eq(schema.schools.id, live.schoolId))).toHaveLength(1);
    expect(await testDb!.select().from(schema.demoCreations).where(eq(schema.demoCreations.ipHash, "old"))).toEqual([]);
  });
});

describe.skipIf(skipIfNoTestDb)("DEMO: creation limits", () => {
  beforeEach(async () => {
    if (shouldSkip()) return;
    await testDb!.delete(schema.demoCreations);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lets exactly one of several simultaneous requests take an IP's last slot", async () => {
    if (shouldSkip()) return;
    await testDb!.insert(schema.demoCreations).values([{ ipHash: "ip-a" }, { ipHash: "ip-a" }]);
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveDemoSlot("ip-a")));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "ip_limit")).toHaveLength(4);
  });

  it("still counts creations after their demo is deleted (start over)", async () => {
    if (shouldSkip()) return;
    for (let i = 0; i < 3; i++) {
      expect(await reserveDemoSlot("ip-b")).toBe("ok");
      const demo = await newDemo();
      await deleteDemoSchool(demo.schoolId);
    }
    expect(await reserveDemoSlot("ip-b")).toBe("ip_limit");
  });

  it("lets exactly one simultaneous request take the global last slot", async () => {
    if (shouldSkip()) return;
    await testDb!.insert(schema.demoCreations).values(
      Array.from({ length: DEMO_GLOBAL_PER_DAY - 1 }, () => ({ ipHash: randomUUID() })));
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => reserveDemoSlot(`ip-g${i}`)));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "global_limit")).toHaveLength(4);
  });

  it("refuses new demos once the database passes the size limit", async () => {
    if (shouldSkip()) return;
    vi.stubEnv("DEMO_DB_SIZE_LIMIT_MB", "0.001");
    expect(await reserveDemoSlot("ip-c")).toBe("db_full");
  });
});

describe.skipIf(skipIfNoTestDb)("DEMO: per-demo caps and text limits (trigger)", () => {
  it("caps events, including bulk inserts and concurrent writers", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const [type] = await testDb!.select({ id: schema.eventTypes.id }).from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, demo.schoolId)).limit(1);
    const room = 500 - (await rowCount("events", demo.schoolId)) - 1;
    await testDb!.insert(schema.events).values(Array.from({ length: room }, () => eventRow(demo.schoolId, type.id, demo.staffId)));
    const insertOne = () => withSchool(demo.schoolId, (tx) => tx.insert(schema.events).values(eventRow(demo.schoolId, type.id, demo.staffId)));
    const results = await Promise.allSettled([insertOne(), insertOne()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await rowCount("events", demo.schoolId)).toBe(500);
    await expectLimit(insertOne(), 403, "demo_quota");
  });

  it("caps revisions, event types and calendar subscriptions", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const [event] = await testDb!.select({ id: schema.events.id }).from(schema.events)
      .where(eq(schema.events.schoolId, demo.schoolId)).limit(1);
    const revision = { eventId: event.id, schoolId: demo.schoolId, snapshot: {} };
    await testDb!.insert(schema.eventRevisions).values(Array.from({ length: 1000 }, () => revision));
    await expectLimit(testDb!.insert(schema.eventRevisions).values(revision), 403, "demo_quota");

    const type = (key: string) => ({ schoolId: demo.schoolId, key, labelHe: key, labelEn: key, colorHex: "#000000", glyph: "Z" });
    await testDb!.insert(schema.eventTypes).values(Array.from({ length: 39 }, (_, i) => type(`t${i}`)));
    await expectLimit(testDb!.insert(schema.eventTypes).values(type("one-more")), 403, "demo_quota");

    const sub = () => ({ staffUserId: demo.staffId, schoolId: demo.schoolId, token: randomBytes(24).toString("hex") });
    await testDb!.insert(schema.icalSubscriptions).values(Array.from({ length: 10 }, sub));
    await expectLimit(testDb!.insert(schema.icalSubscriptions).values(sub()), 403, "demo_quota");
  });

  it("bounds event dates in demos only", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const [type] = await testDb!.select({ id: schema.eventTypes.id }).from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, demo.schoolId)).limit(1);
    const huge = { ...eventRow(demo.schoolId, type.id, demo.staffId), endAt: new Date("9997-01-01T00:00:00Z") };
    await expectLimit(testDb!.insert(schema.events).values(huge), 400, "demo_date_range");
    const [existing] = await testDb!.select({ id: schema.events.id }).from(schema.events)
      .where(eq(schema.events.schoolId, demo.schoolId)).limit(1);
    await expectLimit(
      testDb!.update(schema.events).set({ endAt: new Date("9997-01-01T00:00:00Z") }).where(eq(schema.events.id, existing.id)),
      400,
      "demo_date_range",
    );
    const [typeA] = await testDb!.select({ id: schema.eventTypes.id }).from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, testSchoolA)).limit(1);
    const [staffA] = await testDb!.select({ id: schema.staffUsers.id }).from(schema.staffUsers)
      .where(eq(schema.staffUsers.schoolId, testSchoolA)).limit(1);
    if (!typeA || !staffA) return;
    const [real] = await testDb!.insert(schema.events)
      .values({ ...eventRow(testSchoolA, typeA.id, staffA.id), endAt: new Date("2030-01-01T00:00:00Z") })
      .returning({ id: schema.events.id });
    await testDb!.delete(schema.events).where(eq(schema.events.id, real.id));
  });

  it("limits text length in demos only", async () => {
    if (shouldSkip()) return;
    const demo = await newDemo();
    const [type] = await testDb!.select({ id: schema.eventTypes.id }).from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, demo.schoolId)).limit(1);
    const longTitle = "א".repeat(201);
    await expectLimit(testDb!.insert(schema.events).values(eventRow(demo.schoolId, type.id, demo.staffId, longTitle)), 400, "demo_text_too_long");
    const [typeA] = await testDb!.select({ id: schema.eventTypes.id }).from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, testSchoolA)).limit(1);
    const [staffA] = await testDb!.select({ id: schema.staffUsers.id }).from(schema.staffUsers)
      .where(eq(schema.staffUsers.schoolId, testSchoolA)).limit(1);
    if (!typeA || !staffA) return;
    const [real] = await testDb!.insert(schema.events).values(eventRow(testSchoolA, typeA.id, staffA.id, longTitle))
      .returning({ id: schema.events.id });
    await testDb!.delete(schema.events).where(eq(schema.events.id, real.id));
  });
});
