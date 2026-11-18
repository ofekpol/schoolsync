import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notFoundResponse, requireBoard } from "@/lib/timetable/api-guard";
import { getSolutionGrid } from "@/lib/timetable/solutions";
import { SolutionGridResponseSchema } from "@/lib/validations/timetable-runs";

type RouteContext = { params: Promise<{ board: string; run: string; solution: string }> };

/** GET — one solution as a lesson list with names (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const ids = z.object({ run: z.string().uuid(), solution: z.string().uuid() }).safeParse(await params);
  if (!ids.success) return notFoundResponse();
  const { user, board } = guard.value;
  const grid = await getSolutionGrid(user.schoolId, board.id, ids.data.run, ids.data.solution);
  if (!grid) return notFoundResponse();
  return NextResponse.json(SolutionGridResponseSchema.parse(grid));
}
