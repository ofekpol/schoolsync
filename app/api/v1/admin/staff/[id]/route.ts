import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { updateStaffUser } from "@/lib/db/staff";
import { StaffUserUpdateSchema } from "@/lib/validations/admin";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = StaffUserUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await updateStaffUser(user!.schoolId, id, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e instanceof Response) {
      return NextResponse.json({ error: e.statusText || "Error" }, { status: e.status });
    }
    throw e;
  }
}
