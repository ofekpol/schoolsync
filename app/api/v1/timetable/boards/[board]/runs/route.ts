import { after, NextRequest, NextResponse } from "next/server";
import { executeRun, listRuns, startRun } from "@/lib/timetable/runs";
import { invalidInput, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { RunsResponseSchema, StartRunRequestSchema, StartRunResponseSchema } from "@/lib/validations/timetable-runs";

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

/** POST — queues a run and solves it after the response (admin). Optional body `{ fromSolutionId }` regenerates around its pins. */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const { user, board } = guard.value;
  // An empty body is `{}`; invalid JSON becomes null and fails the schema.
  const raw: unknown = await request.text().then((text) => (text.trim() ? JSON.parse(text) : {})).catch(() => null);
  const body = StartRunRequestSchema.safeParse(raw);
  if (!body.success) return invalidInput(body.error.flatten());
  return withTimetableErrors(async () => {
    const { runId } = await startRun(user.schoolId, board.id, user.id, undefined, body.data.fromSolutionId);
    after(() => executeRun(user.schoolId, runId));
    return NextResponse.json(StartRunResponseSchema.parse({ runId }), { status: 202 });
  });
}
