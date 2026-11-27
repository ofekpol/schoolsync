import { NextRequest, NextResponse } from "next/server";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { invalidInput, requireRoomsPermission } from "@/lib/rooms/guard";
import { createRoom } from "@/lib/rooms/rooms";
import { RoomNameInputSchema, RoomSchema } from "@/lib/validations/rooms";

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
