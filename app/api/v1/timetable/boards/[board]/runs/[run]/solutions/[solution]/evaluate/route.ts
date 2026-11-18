import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notFoundResponse, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { evaluateSolution } from "@/lib/timetable/edit";
import { EvaluateResponseSchema } from "@/lib/validations/timetable-runs";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ board: string; run: string; solution: string }> };

/** POST — ask the solver for the full constraint report of the current placements (admin). */
export async function POST(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const ids = z.object({ run: z.string().uuid(), solution: z.string().uuid() }).safeParse(await params);
  if (!ids.success) return notFoundResponse();
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const result = await evaluateSolution(user.schoolId, { boardId: board.id, runId: ids.data.run, solutionId: ids.data.solution });
    if (!result) return notFoundResponse();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "placements_changed" ? 409 : 502 });
    return NextResponse.json(EvaluateResponseSchema.parse({ solution: result.solution }));
  });
}
