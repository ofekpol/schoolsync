import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { cancelBooking } from "@/lib/rooms/bookings";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { notFoundResponse, requireRoomsPermission } from "@/lib/rooms/guard";
import { RoomIdSchema } from "@/lib/validations/rooms";

type RouteContext = { params: Promise<{ groupId: string }> };

/** DELETE — cancel a booking: your own (rooms.book), or anyone's (rooms.manage). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.book", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).groupId);
  if (!id.success) return notFoundResponse();
  const canManage = await hasPermission(guard.user, "rooms.manage");
  return withRoomsErrors(async () =>
    (await cancelBooking(guard.user, id.data, canManage)) ? new NextResponse(null, { status: 204 }) : notFoundResponse(),
  );
}
