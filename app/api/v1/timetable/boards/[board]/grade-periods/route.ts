import { NextRequest, NextResponse } from "next/server";
import { setGradeSubjectPeriods } from "@/lib/timetable/blocks-grade";
import { readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { GradePeriodsInputSchema, GradePeriodsResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** PUT — one subject's weekly periods for every class of a grade (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, GradePeriodsInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const result = await setGradeSubjectPeriods(user.schoolId, board.id, body.value);
    return NextResponse.json(GradePeriodsResponseSchema.parse(result));
  });
}
