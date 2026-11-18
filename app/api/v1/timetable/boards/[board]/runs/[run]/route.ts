import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRun } from "@/lib/timetable/runs";
import { notFoundResponse, requireBoard } from "@/lib/timetable/api-guard";
import { RunResponseSchema } from "@/lib/validations/timetable-runs";

type RouteContext = { params: Promise<{ board: string; run: string }> };

/** GET — one run with its solutions' summaries (admin); polled while it runs. */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const runId = z.string().uuid().safeParse((await params).run);
  if (!runId.success) return notFoundResponse();
  const { user, board } = guard.value;
  const run = await getRun(user.schoolId, board.id, runId.data);
  if (!run) return notFoundResponse();
  return NextResponse.json(RunResponseSchema.parse({ run }));
}
