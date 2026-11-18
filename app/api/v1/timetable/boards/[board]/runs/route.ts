import { after, NextRequest, NextResponse } from "next/server";
import { executeRun, listRuns, startRun } from "@/lib/timetable/runs";
import { requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { RunsResponseSchema, StartRunResponseSchema } from "@/lib/validations/timetable-runs";

type RouteContext = { params: Promise<{ board: string }> };

// The solver runs after the response, inside this invocation.
export const maxDuration = 300;

/** GET — the board's runs, newest first (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const { user, board } = guard.value;
  return NextResponse.json(RunsResponseSchema.parse({ runs: await listRuns(user.schoolId, board.id) }));
}

/** POST — queues a run and solves it after the response (admin). */
export async function POST(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const { runId } = await startRun(user.schoolId, board.id, user.id);
    after(() => executeRun(user.schoolId, runId));
    return NextResponse.json(StartRunResponseSchema.parse({ runId }), { status: 202 });
  });
}
