import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { AI_DAILY_LIMITS, consumeAiQuota } from "@/lib/ai/quota";
import { testDb, skipIfNoTestDb, shouldSkip, testSchoolA, testSchoolB } from "./setup";

const EMAIL = "ai-quota@test";
// 12:00 Jerusalem on 27 Oct 2026 (winter time, +02:00).
const NOW = new Date("2026-10-27T10:00:00Z");

async function ensureStaff(): Promise<string> {
  const existing = await testDb!
    .select({ id: schema.staffUsers.id })
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.email, EMAIL))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await testDb!
    .insert(schema.staffUsers)
    .values({ id: randomUUID(), schoolId: testSchoolA, email: EMAIL, fullName: EMAIL, role: "editor" })
    .returning({ id: schema.staffUsers.id });
  return row.id;
}

async function seedRows(schoolId: string, staffId: string, action: string, count: number, at: Date) {
  const rows = Array.from({ length: count }, () => ({
    schoolId,
    actorStaffId: staffId,
    action,
    targetTable: "ai_requests",
    at,
  }));
  await testDb!.insert(schema.auditLog).values(rows);
}

describe.skipIf(skipIfNoTestDb)("AI-QUOTA: consumeAiQuota", () => {
  let staffId: string;

  beforeAll(async () => {
    if (shouldSkip()) return;
    staffId = await ensureStaff();
  });

  beforeEach(async () => {
    if (shouldSkip()) return;
    await testDb!.delete(schema.auditLog).where(eq(schema.auditLog.actorStaffId, staffId));
  });

  it("allows up to the limit then refuses", async () => {
    if (shouldSkip()) return;
    await seedRows(testSchoolA, staffId, "ai_parse_events", AI_DAILY_LIMITS.ai_parse_events - 1, NOW);
    const last = await consumeAiQuota(testSchoolA, staffId, "ai_parse_events", { chars: 10 }, NOW);
    expect(last).toEqual({ ok: true, remaining: 0 });
    const over = await consumeAiQuota(testSchoolA, staffId, "ai_parse_events", { chars: 10 }, NOW);
    expect(over).toEqual({ ok: false, limit: 20 });
  });

  it("counts per action", async () => {
    if (shouldSkip()) return;
    await seedRows(testSchoolA, staffId, "ai_parse_events", 20, NOW);
    const chat = await consumeAiQuota(testSchoolA, staffId, "ai_chat", { chars: 5 }, NOW);
    expect(chat).toEqual({ ok: true, remaining: 49 });
  });

  it("resets on the next Jerusalem day", async () => {
    if (shouldSkip()) return;
    // 23:30 Jerusalem on 26 Oct = 21:30Z — the previous Jerusalem day.
    await seedRows(testSchoolA, staffId, "ai_parse_events", 20, new Date("2026-10-26T21:30:00Z"));
    const res = await consumeAiQuota(testSchoolA, staffId, "ai_parse_events", { chars: 1 }, NOW);
    expect(res).toEqual({ ok: true, remaining: 19 });
  });

  it("does not count another school's rows", async () => {
    if (shouldSkip()) return;
    await seedRows(testSchoolB, staffId, "ai_parse_events", 20, NOW);
    const res = await consumeAiQuota(testSchoolA, staffId, "ai_parse_events", { chars: 1 }, NOW);
    expect(res).toEqual({ ok: true, remaining: 19 });
  });

  it("writes an audit_log row with action and chars", async () => {
    if (shouldSkip()) return;
    await consumeAiQuota(testSchoolA, staffId, "ai_chat", { chars: 42 }, NOW);
    const rows = await testDb!
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorStaffId, staffId), eq(schema.auditLog.action, "ai_chat")));
    expect(rows).toHaveLength(1);
    expect(rows[0].schoolId).toBe(testSchoolA);
    expect(rows[0].targetTable).toBe("ai_requests");
    expect(rows[0].payload).toEqual({ chars: 42 });
  });

  it("lets only one of several simultaneous requests take the last slot", async () => {
    if (shouldSkip()) return;
    await seedRows(testSchoolA, staffId, "ai_parse_events", AI_DAILY_LIMITS.ai_parse_events - 1, NOW);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        consumeAiQuota(testSchoolA, staffId, "ai_parse_events", { chars: 1 }, NOW),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
