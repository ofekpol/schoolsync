import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { updateStaffUser } from "@/lib/db/staff";
import { StaffUserUpdateSchema } from "@/lib/validations/admin";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";
import { guardFailureResponse } from "@/lib/auth/thrown-response";
import { thrownResponseToJson } from "@/lib/auth/thrown-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  try {
    assertAdmin(user);
  } catch (e) {
    return guardFailureResponse(e);
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
    return thrownResponseToJson(e);
  }
}
