import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notFoundResponse, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { publishSolution } from "@/lib/timetable/edit";
import { PublishResponseSchema } from "@/lib/validations/timetable-runs";

type RouteContext = { params: Promise<{ board: string; run: string; solution: string }> };

/** POST — make this solution the board's published timetable (admin). */
export async function POST(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const ids = z.object({ run: z.string().uuid(), solution: z.string().uuid() }).safeParse(await params);
  if (!ids.success) return notFoundResponse();
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const ref = { boardId: board.id, runId: ids.data.run, solutionId: ids.data.solution };
    if (!(await publishSolution(user.schoolId, ref))) return notFoundResponse();
    return NextResponse.json(PublishResponseSchema.parse({ publishedSolutionId: ref.solutionId }));
  });
}
