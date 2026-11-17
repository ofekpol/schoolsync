import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answerAsTeacher } from "@/lib/timetable/constraints/me";
import { invalidInput, readBody, requireTimetableStaff, withTimetableErrors } from "@/lib/timetable/api-guard";
import { FillInInputSchema, FillInResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** PUT — the signed-in teacher's own free day on a board (null = no request), before the deadline. */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireTimetableStaff(true);
  if (!guard.ok) return guard.response;
  const boardId = z.string().uuid().safeParse((await params).board);
  if (!boardId.success) return invalidInput();
  const body = await readBody(request, FillInInputSchema);
  if (!body.ok) return body.response;
  const user = guard.value;
  return withTimetableErrors(async () => {
    const response = await answerAsTeacher(user.schoolId, user.id, boardId.data, body.value.freeDay);
    return NextResponse.json(FillInResponseSchema.parse({ response }));
  });
}
