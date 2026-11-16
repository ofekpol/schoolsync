import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fillInForTeacher } from "@/lib/timetable/constraints/collect";
import { invalidInput, readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { FillInInputSchema, FillInResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; teacher: string }> };

/** PUT — management answers for a teacher: their free day, or none (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const teacherId = z.string().uuid().safeParse((await params).teacher);
  if (!teacherId.success) return invalidInput();
  const body = await readBody(request, FillInInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const response = await fillInForTeacher(user.schoolId, board.id, teacherId.data, body.value.freeDay, user.id);
    return NextResponse.json(FillInResponseSchema.parse({ response }));
  });
}
