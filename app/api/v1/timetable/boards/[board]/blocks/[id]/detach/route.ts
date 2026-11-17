import { NextRequest, NextResponse } from "next/server";
import { detachClassFromPlata } from "@/lib/timetable/blocks-grade";
import {
  invalidInput,
  itemId,
  notFoundResponse,
  readBody,
  requireBoard,
  withTimetableErrors,
} from "@/lib/timetable/api-guard";
import { BlockResponseSchema, DetachClassInputSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; id: string }> };

/** POST — takes a class out of a Plata; returns the class's own new lesson (admin). */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const body = await readBody(request, DetachClassInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const block = await detachClassFromPlata(user.schoolId, board.id, id, body.value.classId);
    if (!block) return notFoundResponse();
    return NextResponse.json(BlockResponseSchema.parse({ block }), { status: 201 });
  });
}
