import { type NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { getStaffUser } from "@/lib/auth/session";
import { revokeInvite } from "@/lib/db/invites";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  await revokeInvite(id, user.schoolId);
  return NextResponse.json({ ok: true });
}
