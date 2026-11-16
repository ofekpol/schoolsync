import { NextRequest, NextResponse } from "next/server";
import { deleteTeacher, updateTeacher } from "@/lib/timetable/teachers";
import {
  invalidInput,
  itemId,
  notFoundResponse,
  readBody,
  requireBoard,
  withTimetableErrors,
} from "@/lib/timetable/api-guard";
import { TeacherPatchInputSchema, TeacherResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; id: string }> };

/** PATCH — renames a teacher, sets the free-day entitlement or the linked staff user (admin). */
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const body = await readBody(request, TeacherPatchInputSchema);
  if (!body.ok) return body.response;
  return withTimetableErrors(async () => {
    const teacher = await updateTeacher(guard.value.user.schoolId, id, body.value);
    if (!teacher) return notFoundResponse();
    return NextResponse.json(TeacherResponseSchema.parse({ teacher }));
  });
}

/** DELETE — removes a teacher; in_use when a lesson uses them (admin). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  return withTimetableErrors(async () => {
    const deleted = await deleteTeacher(guard.value.user.schoolId, id);
    return deleted ? new NextResponse(null, { status: 204 }) : notFoundResponse();
  });
}
