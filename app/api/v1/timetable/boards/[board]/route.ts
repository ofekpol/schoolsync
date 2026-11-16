import { NextRequest, NextResponse } from "next/server";
import { buildSolverInput } from "@/lib/timetable/export";
import { notFoundResponse, requireBoard } from "@/lib/timetable/api-guard";
import { BoardDetailResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board and what keeps it from being solvable as entered (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const { user, board } = guard.value;
  const exported = await buildSolverInput(user.schoolId, board.id);
  if (!exported) return notFoundResponse();
  return NextResponse.json(BoardDetailResponseSchema.parse({ board, problems: exported.problems }));
}
