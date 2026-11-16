import { NextRequest, NextResponse } from "next/server";
import { deleteSubject, renameSubject } from "@/lib/timetable/subjects";
import {
  invalidInput,
  itemId,
  notFoundResponse,
  readBody,
  requireBoard,
  withTimetableErrors,
} from "@/lib/timetable/api-guard";
import { SubjectRenameInputSchema, SubjectResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; id: string }> };

/** PATCH — renames a subject (admin). */
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const body = await readBody(request, SubjectRenameInputSchema);
  if (!body.ok) return body.response;
  return withTimetableErrors(async () => {
    const subject = await renameSubject(guard.value.user.schoolId, id, body.value.name);
    if (!subject) return notFoundResponse();
    return NextResponse.json(SubjectResponseSchema.parse({ subject }));
  });
}

/** DELETE — removes a subject; in_use when a lesson uses it (admin). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  return withTimetableErrors(async () => {
    const deleted = await deleteSubject(guard.value.user.schoolId, id);
    return deleted ? new NextResponse(null, { status: 204 }) : notFoundResponse();
  });
}
