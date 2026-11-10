import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { reorderEventTypes } from "@/lib/admin/event-types";
import { EventTypeOrderSchema } from "@/lib/validations/admin";

/** PUT { ids } — admin sets the display order of the school's event types. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const body = await request.json().catch(() => null);
  const parsed = EventTypeOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const result = await reorderEventTypes(user!.schoolId, parsed.data.ids);
  if (!result.reordered) return NextResponse.json({ error: "stale_order" }, { status: 409 });
  return NextResponse.json({ reordered: true }, { status: 200 });
}
