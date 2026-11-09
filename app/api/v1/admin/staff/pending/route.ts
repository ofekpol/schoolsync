import { type NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { getStaffUser } from "@/lib/auth/session";
import {
  approvePendingRegistration,
  listPendingRegistrations,
  rejectPendingRegistration,
} from "@/lib/db/pending";
import { ApprovePendingSchema } from "@/lib/validations/admin";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }

  const pending = await listPendingRegistrations(user.schoolId);
  return NextResponse.json({ pending });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }

  const parsed = ApprovePendingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "reject") {
    try {
      await rejectPendingRegistration({
        pendingId: parsed.data.pendingId,
        schoolId: user.schoolId,
        reviewedBy: user.id,
      });
    } catch (e) {
      if (isNotFound(e)) return NextResponse.json({ error: "Not found" }, { status: 404 });
      throw e;
    }
    return NextResponse.json({ ok: true });
  }

  const role = parsed.data.role;
  let result: Awaited<ReturnType<typeof approvePendingRegistration>>;
  try {
    // Always the admin's own school — never a client-supplied school id.
    result = await approvePendingRegistration({
      pendingId: parsed.data.pendingId,
      schoolId: user.schoolId,
      role,
      fullName: parsed.data.fullName,
      gradeScopes: parsed.data.gradeScopes,
      eventTypeScopes: parsed.data.eventTypeScopes,
      approvedBy: user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "staff_user_in_other_school") {
      return NextResponse.json({ error: "Conflict" }, { status: 409 });
    }
    if (isNotFound(e)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  return NextResponse.json({ ok: true, staffUserId: result.staffUserId });
}

/** Unknown id, already reviewed, or another school's row — all look the same to the caller. */
function isNotFound(e: unknown): boolean {
  return e instanceof Error && e.message === "pending_registration_not_found";
}
