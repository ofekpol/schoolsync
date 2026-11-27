import { NextRequest, NextResponse } from "next/server";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { invalidInput, requireRoomsPermission } from "@/lib/rooms/guard";
import { createRoom } from "@/lib/rooms/rooms";
import { getDay } from "@/lib/rooms/occupancy";
import { jerusalemDateString } from "@/lib/datetime";
import { DayQuerySchema, DayViewSchema, RoomNameInputSchema, RoomSchema } from "@/lib/validations/rooms";

/** GET ?date=&periods=&free=1&q=&mine=1 — every room's day (rooms.book). Date defaults to today. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.book", false);
  if (!guard.ok) return guard.response;
  const query = DayQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return invalidInput(query.error.flatten());
  const { date, periods, free, q, mine } = query.data;
  const day = await getDay(
    guard.user.schoolId,
    date ?? jerusalemDateString(new Date()),
    { periods, freeOnly: free === "1", q, mine: mine === "1" },
    guard.user.id,
  );
  return NextResponse.json(DayViewSchema.parse(day));
}

/** POST { name } — add a room (rooms.manage). 409 `duplicate_name`. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const parsed = RoomNameInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return withRoomsErrors(async () => {
    const room = await createRoom(guard.user.schoolId, parsed.data.name);
    return NextResponse.json(RoomSchema.parse(room), { status: 201 });
  });
}
