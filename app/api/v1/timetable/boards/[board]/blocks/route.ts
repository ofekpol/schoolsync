import { NextRequest, NextResponse } from "next/server";
import { createBlock, listBlocks } from "@/lib/timetable/blocks";
import { readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { BlockInputSchema, BlockResponseSchema, BlocksResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board's lesson blocks (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const blocks = await listBlocks(guard.value.user.schoolId, guard.value.board.id);
  return NextResponse.json(BlocksResponseSchema.parse({ blocks }));
}

/** POST — a lesson (one class) or a Plata (several classes of one grade) (admin). */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, BlockInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const block = await createBlock(user.schoolId, board.id, body.value);
    return NextResponse.json(BlockResponseSchema.parse({ block }), { status: 201 });
  });
}
