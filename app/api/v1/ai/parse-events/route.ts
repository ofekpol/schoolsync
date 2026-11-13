import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { isAiEnabled } from "@/lib/ai/model";
import { consumeAiQuota } from "@/lib/ai/quota";
import { extractEvents } from "@/lib/ai/adder/extract";
import { normalizeExtracted, type NormalizeContext } from "@/lib/ai/adder/normalize";
import { findConflicts } from "@/lib/ai/adder/conflicts";
import { CandidateEventSchema, type CandidateEvent, type ExtractedEvent } from "@/lib/ai/adder/types";
import { getEditorAllowedGrades, isEventTypeAllowed, listEventTypes } from "@/lib/events/queries";
import { jerusalemDateString } from "@/lib/datetime";
import type { StaffUserRecord } from "@/lib/db/staff";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

const ParseEventsRequestSchema = z.object({ text: z.string().trim().min(1).max(3000) });
const ParseEventsResponseSchema = z.object({ candidates: z.array(CandidateEventSchema) });

const ALL_GRADES = [7, 8, 9, 10, 11, 12];

function error(code: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

async function buildContext(user: StaffUserRecord & { schoolId: string }) {
  const types = await listEventTypes(user.schoolId);
  const isAdmin = user.role === "admin";
  const allowed = isAdmin
    ? null
    : new Set(
        (await Promise.all(types.map(async (t) => ((await isEventTypeAllowed(user, t.id)) ? t.id : null))))
          .filter((id): id is string => id !== null),
      );
  const normalize: NormalizeContext = {
    eventTypes: types,
    allowedTypeIds: allowed,
    allowedGrades: isAdmin ? ALL_GRADES : await getEditorAllowedGrades(user.schoolId, user.id),
    today: jerusalemDateString(new Date()),
  };
  const extract = {
    today: normalize.today,
    eventTypes: types.filter((t) => !allowed || allowed.has(t.id)).map((t) => ({ key: t.key, labelHe: t.labelHe })),
  };
  return { normalize, extract };
}

async function toCandidates(schoolId: string, extracted: ExtractedEvent[], ctx: NormalizeContext) {
  const candidates: CandidateEvent[] = extracted.map((ex) => normalizeExtracted(ex, ctx, randomUUID()));
  const conflicts = await findConflicts(schoolId, candidates);
  return candidates.map((c) => ({ ...c, warnings: [...c.warnings, ...(conflicts.get(c.clientId) ?? [])] }));
}

/** Smart event adder: free Hebrew text → reviewable candidate events. Never writes events. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  if (!user || !user.schoolId) return error("unauthorized", 401);
  if (user.role === "viewer" || user.status !== "active" || user.mustChangePassword) {
    return error("forbidden", 403);
  }
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  if (!isAiEnabled()) return error("ai_disabled", 503);

  const parsed = ParseEventsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("invalid_input", 400);
  const { text } = parsed.data;

  const schoolUser = { ...user, schoolId: user.schoolId };
  const quota = await consumeAiQuota(user.schoolId, user.id, "ai_parse_events", { chars: text.length });
  if (!quota.ok) return error("quota_exceeded", 429, { limit: quota.limit });

  const ctx = await buildContext(schoolUser);
  let extracted: ExtractedEvent[];
  try {
    extracted = await extractEvents(text, ctx.extract);
  } catch {
    return error("ai_unavailable", 502);
  }
  const candidates = await toCandidates(user.schoolId, extracted, ctx.normalize);
  return NextResponse.json(ParseEventsResponseSchema.parse({ candidates }));
}
