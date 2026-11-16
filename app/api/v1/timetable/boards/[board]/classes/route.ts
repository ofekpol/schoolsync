import { NextRequest, NextResponse } from "next/server";
import { listClasses, setGradeClassCount } from "@/lib/timetable/classes";
import { readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { ClassCountInputSchema, ClassesResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board's classes, by grade then number (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const classes = await listClasses(guard.value.user.schoolId, guard.value.board.id);
  return NextResponse.json(ClassesResponseSchema.parse({ classes }));
}

/** PUT — sets how many classes a grade has; in_use when a removed class has lessons (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, ClassCountInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const classes = await setGradeClassCount(user.schoolId, board.id, body.value.grade, body.value.count);
    return NextResponse.json(ClassesResponseSchema.parse({ classes }));
  });
}
