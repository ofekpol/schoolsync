import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notFoundResponse, readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { editPlacement } from "@/lib/timetable/edit";
import { PlacementEditSchema } from "@/lib/validations/timetable-runs";

type RouteContext = { params: Promise<{ board: string; run: string; solution: string }> };

/** PATCH — move, place, unplace or pin one lesson of a solution (admin). */
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const ids = z.object({ run: z.string().uuid(), solution: z.string().uuid() }).safeParse(await params);
  if (!ids.success) return notFoundResponse();
  const body = await readBody(request, PlacementEditSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const ref = { boardId: board.id, runId: ids.data.run, solutionId: ids.data.solution };
    const found = await editPlacement(user.schoolId, ref, body.value);
    return found ? new NextResponse(null, { status: 204 }) : notFoundResponse();
  });
}
