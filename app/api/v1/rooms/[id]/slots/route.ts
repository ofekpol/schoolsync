import { NextRequest, NextResponse } from "next/server";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { invalidInput, notFoundResponse, requireRoomsPermission } from "@/lib/rooms/guard";
import { listSlots, setSlot } from "@/lib/rooms/slots";
import { RoomIdSchema, SlotInputSchema, SlotsResponseSchema } from "@/lib/validations/rooms";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — the room's weekly slots in the active year (rooms.manage). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", false);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).id);
  if (!id.success) return notFoundResponse();
  const slots = await listSlots(guard.user.schoolId, id.data);
  return NextResponse.json(SlotsResponseSchema.parse({ slots }));
}

/** PUT { day, period, label, staffUserId? } — set the room's use at one weekly cell (rooms.manage). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).id);
  const parsed = SlotInputSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return notFoundResponse();
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return withRoomsErrors(async () => {
    const slot = await setSlot(guard.user.schoolId, id.data, parsed.data, guard.user.id);
    return slot ? NextResponse.json(slot) : notFoundResponse();
  });
}
