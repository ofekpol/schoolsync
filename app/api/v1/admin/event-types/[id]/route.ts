import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { updateEventType, deleteEventType } from "@/lib/admin/event-types";
import { EventTypeSchema } from "@/lib/validations/admin";
import { withDemoLimits } from "@/lib/auth/demo-guard";

type RouteContext = { params: Promise<{ id: string }> };

async function handlePATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = EventTypeSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const result = await updateEventType(user!.schoolId, id, parsed.data);
  if (!result.updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ updated: true }, { status: 200 });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const { id } = await params;
  try {
    const result = await deleteEventType(user!.schoolId, id);
    if (!result.deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.toLowerCase().includes("foreign key") || msg.includes("23503")) {
      return NextResponse.json({ error: "in_use" }, { status: 409 });
    }
    throw e;
  }
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const PATCH = withDemoLimits(handlePATCH);
