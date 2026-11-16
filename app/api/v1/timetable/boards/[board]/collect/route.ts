import { NextRequest, NextResponse } from "next/server";
import { getCollectState, listResponses, startCollecting } from "@/lib/timetable/constraints/collect";
import { notFoundResponse, readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import {
  CollectResponseSchema,
  CollectStateResponseSchema,
  DeadlineInputSchema,
} from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board's collection state and every teacher's answer (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const { user, board } = guard.value;
  const [state, responses] = await Promise.all([
    getCollectState(user.schoolId, board.id),
    listResponses(user.schoolId, board.id),
  ]);
  if (!state) return notFoundResponse();
  return NextResponse.json(CollectResponseSchema.parse({ state, responses }));
}

/** PUT — opens the collection round, or moves its deadline (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, DeadlineInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const state = await startCollecting(user.schoolId, board.id, new Date(body.value.deadline));
    return NextResponse.json(CollectStateResponseSchema.parse({ state }));
  });
}
