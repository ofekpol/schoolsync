import { NextRequest, NextResponse } from "next/server";
import { notFoundResponse, requireRoomsPermission } from "@/lib/rooms/guard";
import { deleteSlot } from "@/lib/rooms/slots";
import { RoomIdSchema } from "@/lib/validations/rooms";

type RouteContext = { params: Promise<{ slotId: string }> };

/** DELETE — clear a weekly slot (rooms.manage). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).slotId);
  if (!id.success) return notFoundResponse();
  return (await deleteSlot(guard.user.schoolId, id.data)) ? new NextResponse(null, { status: 204 }) : notFoundResponse();
}
