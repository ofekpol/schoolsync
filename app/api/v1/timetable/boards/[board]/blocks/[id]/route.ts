import { NextRequest, NextResponse } from "next/server";
import { deleteBlock, replaceBlock } from "@/lib/timetable/blocks";
import {
  invalidInput,
  itemId,
  notFoundResponse,
  readBody,
  requireBoard,
  withTimetableErrors,
} from "@/lib/timetable/api-guard";
import { BlockInputSchema, BlockResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; id: string }> };

/** PUT — replaces a block's subject, periods, classes and teachers (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const body = await readBody(request, BlockInputSchema);
  if (!body.ok) return body.response;
  return withTimetableErrors(async () => {
    const block = await replaceBlock(guard.value.user.schoolId, id, body.value);
    if (!block) return notFoundResponse();
    return NextResponse.json(BlockResponseSchema.parse({ block }));
  });
}

/** DELETE — removes a lesson block (admin). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const deleted = await deleteBlock(guard.value.user.schoolId, id);
  return deleted ? new NextResponse(null, { status: 204 }) : notFoundResponse();
}
