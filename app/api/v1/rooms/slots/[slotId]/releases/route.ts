import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRoomsErrors } from "@/lib/rooms/errors";
import { invalidInput, notFoundResponse, requireRoomsPermission } from "@/lib/rooms/guard";
import { releaseSlot, unreleaseSlot } from "@/lib/rooms/slots";
import { DateSchema, RoomIdSchema } from "@/lib/validations/rooms";

type RouteContext = { params: Promise<{ slotId: string }> };

const ReleaseSchema = z.object({ date: DateSchema });

const done = (found: boolean): NextResponse => (found ? new NextResponse(null, { status: 204 }) : notFoundResponse());

/** POST { date } — free a weekly slot on one date so it can be booked (rooms.manage). */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).slotId);
  const parsed = ReleaseSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return notFoundResponse();
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return withRoomsErrors(async () =>
    done(await releaseSlot(guard.user.schoolId, id.data, parsed.data.date, guard.user.id)),
  );
}

/** DELETE ?date= — take a release back; 409 `slot_taken` once someone booked it (rooms.manage). */
export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireRoomsPermission("rooms.manage", true);
  if (!guard.ok) return guard.response;
  const id = RoomIdSchema.safeParse((await params).slotId);
  const date = DateSchema.safeParse(request.nextUrl.searchParams.get("date"));
  if (!id.success) return notFoundResponse();
  if (!date.success) return invalidInput();
  return withRoomsErrors(async () => done(await unreleaseSlot(guard.user.schoolId, id.data, date.data)));
}
