import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";
import { publishEvent } from "@/lib/events/approval";
import { createDraft, updateDraft } from "@/lib/events/crud";
import {
  resolveGanttSchoolFromParam,
  resolveSchoolFromParam,
  resolveSchoolIdFromParam,
  updateSchoolServices,
} from "@/lib/db/schools";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

// unstable_cache needs the Next.js runtime; run the loaders uncached here.
vi.mock("next/cache", () => ({
  revalidateTag: () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));

const { GET: getEvents } = await import("@/app/api/v1/public/[school]/events/route");
const TEST_ACTOR = "00000000-0000-0000-0000-0000000000ac";
const { GET: getSignature } = await import("@/app/api/v1/public/[school]/events/signature/route");
const { GET: exportIcs } = await import("@/app/api/v1/export/ics/route");

/**
 * A school's secret link token is the only way into its unauthenticated
 * surfaces. School A's token must never reach school B's data, and a
 * guessable slug must reach nothing.
 */

async function tokenOf(schoolId: string): Promise<string> {
  const [row] = await testDb!
    .select({ accessToken: schema.schools.accessToken })
    .from(schema.schools)
    .where(eq(schema.schools.id, schoolId));
  return row.accessToken;
}

async function publishTitled(schoolId: string, title: string): Promise<string> {
  const editorId = randomUUID();
  await testDb!.insert(schema.staffUsers).values({
    id: editorId, schoolId, email: `link-${editorId}@test`, fullName: "Link editor", role: "editor",
  });
  const [type] = await testDb!
    .select({ id: schema.eventTypes.id })
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.schoolId, schoolId))
    .limit(1);
  const { id } = await createDraft(schoolId, editorId, type.id);
  await updateDraft(schoolId, id, editorId, false, {
    title,
    startAt: new Date("2026-05-21T08:00:00+03:00").toISOString(),
    endAt: new Date("2026-05-21T10:00:00+03:00").toISOString(),
    grades: [9],
  }, null);
  await publishEvent(schoolId, id, editorId);
  return id;
}

function eventsReq(school: string): [Request, { params: Promise<{ school: string }> }] {
  return [new Request(`http://localhost/api/v1/public/${school}/events`), { params: Promise.resolve({ school }) }];
}

function icsReq(school: string): NextRequest {
  return new Request(`http://localhost/api/v1/export/ics?school=${school}`) as unknown as NextRequest;
}

describe.skipIf(skipIfNoTestDb)("school link token isolation", () => {
  let tokenA = "";
  let tokenB = "";
  let eventA = "";
  let eventB = "";

  beforeAll(async () => {
    if (shouldSkip()) return;
    [tokenA, tokenB] = await Promise.all([tokenOf(testSchoolA), tokenOf(testSchoolB)]);
    eventA = await publishTitled(testSchoolA, "link-test A only");
    eventB = await publishTitled(testSchoolB, "link-test B only");
  });

  it("gives every school a distinct 64-hex token", () => {
    expect(tokenA).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenB).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenA).not.toBe(tokenB);
  });

  it("resolves a sign-up ?school= token to exactly that school", async () => {
    expect(await resolveSchoolIdFromParam(tokenA)).toBe(testSchoolA);
    expect(await resolveSchoolIdFromParam(tokenB)).toBe(testSchoolB);
    expect((await resolveSchoolFromParam(tokenA))?.accessToken).toBe(tokenA);
  });

  it("hides a timetable-only school from the public Gantt but keeps its sign-up link", async () => {
    try {
      await updateSchoolServices(testSchoolA, ["timetable"], TEST_ACTOR);
      expect(await resolveGanttSchoolFromParam(tokenA)).toBeNull();
      expect(await resolveSchoolIdFromParam(tokenA)).toBe(testSchoolA);
    } finally {
      await updateSchoolServices(testSchoolA, ["gantt"], TEST_ACTOR);
    }
    expect((await resolveGanttSchoolFromParam(tokenA))?.id).toBe(testSchoolA);
  });

  it.each([["test-a"], ["test-b"], ["0".repeat(64)], [`${"a".repeat(63)}G`], [undefined], [null], [42]])(
    "resolves no school for %s (slugs and unknown tokens)",
    async (raw) => {
      expect(await resolveSchoolIdFromParam(raw)).toBeNull();
    },
  );

  it("public events API with A's token returns A's events and never B's", async () => {
    const res = await getEvents(...eventsReq(tokenA));
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { events: Array<{ id: string }> }).events.map((e) => e.id);
    expect(ids).toContain(eventA);
    expect(ids).not.toContain(eventB);
  });

  it.each([["test-a"], ["test-b"], ["0".repeat(64)]])("public events API 404s for %s", async (school) => {
    expect((await getEvents(...eventsReq(school))).status).toBe(404);
    expect((await getSignature(...eventsReq(school))).status).toBe(404);
  });

  it("ics export with A's token contains A's events only", async () => {
    const res = await exportIcs(icsReq(tokenA));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(eventA);
    expect(body).not.toContain(eventB);
  });

  it("ics export 404s for a slug", async () => {
    expect((await exportIcs(icsReq("test-a"))).status).toBe(404);
  });
});
