import { NextRequest, NextResponse } from "next/server";
import { addTeachers, addTeachersFromStaff, listTeachers } from "@/lib/timetable/teachers";
import { readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import {
  CreatedTeachersSchema,
  TeachersInputSchema,
  TeachersResponseSchema,
} from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board's teachers (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const teachers = await listTeachers(guard.value.user.schoolId, guard.value.board.id);
  return NextResponse.json(TeachersResponseSchema.parse({ teachers }));
}

/** POST — adds teachers from pasted names, or from staff users (exactly one of the two) (admin). */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, TeachersInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  const input = body.value;
  return withTimetableErrors(async () => {
    const created =
      "names" in input
        ? await addTeachers(user.schoolId, board.id, input.names)
        : await addTeachersFromStaff(user.schoolId, board.id, input.staffUserIds);
    return NextResponse.json(CreatedTeachersSchema.parse({ created }), { status: 201 });
  });
}
