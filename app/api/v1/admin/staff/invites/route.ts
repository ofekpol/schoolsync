import { type NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { getStaffUser } from "@/lib/auth/session";
import { createInvite, listInvitesForSchool } from "@/lib/db/invites";
import { StaffInviteCreateSchema } from "@/lib/validations/admin";

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }

  const invites = await listInvitesForSchool(user.schoolId);
  return NextResponse.json({ invites });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = StaffInviteCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  // Scopes only narrow what an editor may edit; viewers/admins always see every class.
  const isEditor = parsed.data.role === "editor";
  const result = await createInvite({
    schoolId: user.schoolId,
    role: parsed.data.role,
    gradeScopes: isEditor ? (parsed.data.gradeScopes ?? []) : [],
    eventTypeScopes: isEditor ? (parsed.data.eventTypeScopes ?? []) : [],
    multiUse: parsed.data.multiUse,
    createdBy: user.id,
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const url = `${appUrl}/invite/${result.token}`;

  return NextResponse.json(
    { token: result.token, url },
    { status: 201 },
  );
}
