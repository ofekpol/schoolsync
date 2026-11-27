import { NextRequest, NextResponse } from "next/server";
import { jerusalemDateString } from "@/lib/datetime";
import { bookRoom, listMyBookings } from "@/lib/rooms/bookings";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { invalidInput, notFoundResponse, requireRoomsPermission } from "@/lib/rooms/guard";
import { BookingInputSchema, DateSchema, MyBookingsResponseSchema } from "@/lib/validations/rooms";

/** GET ?mine=1&from=YYYY-MM-DD — the caller's upcoming bookings (rooms.book). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.book", false);
  if (!guard.ok) return guard.response;
  const params = request.nextUrl.searchParams;
  const from = DateSchema.safeParse(params.get("from") ?? jerusalemDateString(new Date()));
  if (params.get("mine") !== "1" || !from.success) return invalidInput();
  const bookings = await listMyBookings(guard.user, from.data);
  return NextResponse.json(MyBookingsResponseSchema.parse({ bookings }));
}

/** POST { roomId, date, periods, note? } — book consecutive free periods (rooms.book). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.book", true);
  if (!guard.ok) return guard.response;
  const parsed = BookingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return withRoomsErrors(async () => {
    const booked = await bookRoom(guard.user, parsed.data);
    return booked ? NextResponse.json(booked, { status: 201 }) : notFoundResponse();
  });
}
