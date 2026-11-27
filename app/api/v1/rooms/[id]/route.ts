import { NextRequest, NextResponse } from "next/server";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { invalidInput, notFoundResponse, requireRoomsPermission } from "@/lib/rooms/guard";
import { archiveRoom, renameRoom } from "@/lib/rooms/rooms";
import { RoomIdSchema, RoomNameInputSchema, RoomSchema } from "@/lib/validations/rooms";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH { name } — rename a room (rooms.manage). */
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).id);
  const parsed = RoomNameInputSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return notFoundResponse();
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return withRoomsErrors(async () => {
    const room = await renameRoom(guard.user.schoolId, id.data, parsed.data.name);
    return room ? NextResponse.json(RoomSchema.parse(room)) : notFoundResponse();
  });
}

/** DELETE — archive a room (rooms.manage). 409 `room_in_use` while it is used this year or later. */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).id);
  if (!id.success) return notFoundResponse();
  return withRoomsErrors(async () =>
    (await archiveRoom(guard.user.schoolId, id.data)) ? new NextResponse(null, { status: 204 }) : notFoundResponse(),
  );
}
