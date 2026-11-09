import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { createStaffUserDirect, listStaffUsers } from "@/lib/db/staff";
import { generateTempPassword } from "@/lib/auth/password";
import { StaffUserCreateSchema } from "@/lib/validations/admin";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const staff = await listStaffUsers(user!.schoolId);
  return NextResponse.json({ staff }, { status: 200 });
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
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = StaffUserCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const temporaryPassword = generateTempPassword();
  // editor_scopes rows only make sense for editors — mirrors the rule updateStaffUser
  // already enforces (lib/db/staff.ts). Strip scopes server-side so a direct API call
  // can't attach stray grade/event-type scopes to an admin or viewer account.
  const gradeScopes = parsed.data.role === "editor" ? (parsed.data.gradeScopes ?? []) : [];
  const eventTypeScopes = parsed.data.role === "editor" ? (parsed.data.eventTypeScopes ?? []) : [];
  try {
    const result = await createStaffUserDirect({
      schoolId: user.schoolId,
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      password: temporaryPassword,
      gradeScopes,
      eventTypeScopes,
    });
    return NextResponse.json(
      { id: result.id, email: parsed.data.email, temporaryPassword },
      { status: 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create_failed";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "duplicate_email" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed", message: msg }, { status: 500 });
  }
}
