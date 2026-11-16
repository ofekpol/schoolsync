import { NextRequest, NextResponse } from "next/server";
import { addSubjects, listSubjects } from "@/lib/timetable/subjects";
import { readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import {
  CreatedSubjectsSchema,
  SubjectNamesInputSchema,
  SubjectsResponseSchema,
} from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board's subjects (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const subjects = await listSubjects(guard.value.user.schoolId, guard.value.board.id);
  return NextResponse.json(SubjectsResponseSchema.parse({ subjects }));
}

/** POST — adds pasted subject names; names already on the board are skipped (admin). */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, SubjectNamesInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const created = await addSubjects(user.schoolId, board.id, body.value.names);
    return NextResponse.json(CreatedSubjectsSchema.parse({ created }), { status: 201 });
  });
}
