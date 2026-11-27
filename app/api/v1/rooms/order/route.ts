import { NextRequest, NextResponse } from "next/server";
import { invalidInput, requireRoomsPermission } from "@/lib/rooms/guard";
import { reorderRooms } from "@/lib/rooms/rooms";
import { RoomOrderSchema } from "@/lib/validations/rooms";

/** PUT { ids } — set the display order of the school's rooms (rooms.manage). */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const parsed = RoomOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  await reorderRooms(guard.user.schoolId, parsed.data.ids);
  return new NextResponse(null, { status: 204 });
}
