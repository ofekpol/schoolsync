import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { jerusalemDateString, jerusalemWallClockToIso } from "@/lib/datetime";

export type AiAction = "ai_chat" | "ai_parse_events";

/** Per-user requests allowed per Asia/Jerusalem calendar day. */
export const AI_DAILY_LIMITS: Record<AiAction, number> = {
  ai_chat: 50,
  ai_parse_events: 20,
};

export type QuotaResult = { ok: true; remaining: number } | { ok: false; limit: number };

/**
 * Checks the user's daily allowance for `action` and, when there is room,
 * records the request in audit_log (which is also what the count reads).
 */
export async function consumeAiQuota(
  schoolId: string,
  staffId: string,
  action: AiAction,
  meta: { chars: number },
  now: Date = new Date(),
): Promise<QuotaResult> {
  const limit = AI_DAILY_LIMITS[action];
  const dayStart = new Date(jerusalemWallClockToIso(jerusalemDateString(now), "00:00:00"));
  return withSchool(schoolId, async (tx) => {
    // Serialize count+insert per user and action; without it, simultaneous requests all see the same count.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai_quota:${staffId}:${action}`}))`);
    const [{ used }] = await tx
      .select({ used: count() })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.schoolId, schoolId),
          eq(auditLog.actorStaffId, staffId),
          eq(auditLog.action, action),
          gte(auditLog.at, dayStart),
        ),
      );
    if (used >= limit) return { ok: false, limit };
    await tx.insert(auditLog).values({
      schoolId,
      actorStaffId: staffId,
      action,
      targetTable: "ai_requests",
      payload: { chars: meta.chars },
      at: now,
    });
    return { ok: true, remaining: limit - used - 1 };
  });
}
