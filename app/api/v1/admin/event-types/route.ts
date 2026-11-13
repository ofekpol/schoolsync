import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { assertAdmin, assertCanCreateEventType } from "@/lib/auth/admin";
import { createEventType, listEventTypes } from "@/lib/admin/event-types";
import { EventTypeSchema } from "@/lib/validations/admin";
import { withDemoLimits } from "@/lib/auth/demo-guard";

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const ganttOff = await serviceDisabledResponse(user!.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  const eventTypesList = await listEventTypes(user!.schoolId);
  return NextResponse.json({ eventTypes: eventTypesList }, { status: 200 });
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertCanCreateEventType(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const ganttOff = await serviceDisabledResponse(user!.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  const body = await request.json().catch(() => null);
  const parsed = EventTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createEventType(user!.schoolId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "duplicate_key" }, { status: 409 });
    throw e;
  }
}

/** Postgres 23505 (possibly wrapped by Drizzle in `cause`): an explicit key already exists. */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const POST = withDemoLimits(handlePOST);
