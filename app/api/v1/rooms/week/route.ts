import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invalidInput, requireRoomsPermission } from "@/lib/rooms/guard";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { WeekSchema, getWeek, saveWeek } from "@/lib/rooms/week";

const WeekResponseSchema = z.object({ week: WeekSchema.nullable() });
const PutWeekSchema = z.object({ week: WeekSchema });

/** GET — the school's week of periods (rooms.book). */
export async function GET(): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.book", false);
  if (!guard.ok) return guard.response;
  const week = await getWeek(guard.user.schoolId);
  return NextResponse.json(WeekResponseSchema.parse({ week }));
}

/** PUT — replace the week (rooms.manage). 409 `period_in_use` when a used period would vanish. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const parsed = PutWeekSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return withRoomsErrors(async () => {
    await saveWeek(guard.user.schoolId, parsed.data.week);
    return new NextResponse(null, { status: 204 });
  });
}
