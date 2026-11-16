import { NextRequest, NextResponse } from "next/server";
import { createBoard, listBoards } from "@/lib/timetable/boards";
import { readBody, requireTimetableAdmin, withTimetableErrors } from "@/lib/timetable/api-guard";
import { BoardNameInputSchema, BoardResponseSchema, BoardsResponseSchema } from "@/lib/validations/timetable-api";

/** GET — the school's timetable boards, newest first (admin). */
export async function GET(): Promise<NextResponse> {
  const guard = await requireTimetableAdmin(false);
  if (!guard.ok) return guard.response;
  const boards = await listBoards(guard.value.schoolId);
  return NextResponse.json(BoardsResponseSchema.parse({ boards }));
}

/** POST — a new board for the active academic year (admin). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireTimetableAdmin(true);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, BoardNameInputSchema);
  if (!body.ok) return body.response;
  return withTimetableErrors(async () => {
    const board = await createBoard(guard.value.schoolId, body.value.name);
    return NextResponse.json(BoardResponseSchema.parse({ board }), { status: 201 });
  });
}
