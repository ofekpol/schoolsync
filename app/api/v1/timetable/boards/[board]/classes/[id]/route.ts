import { NextRequest, NextResponse } from "next/server";
import { updateClass } from "@/lib/timetable/classes";
import {
  invalidInput,
  itemId,
  notFoundResponse,
  readBody,
  requireBoard,
  withTimetableErrors,
} from "@/lib/timetable/api-guard";
import { ClassPatchInputSchema, ClassResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; id: string }> };

/** PATCH — sets a class's name and type (admin). */
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const body = await readBody(request, ClassPatchInputSchema);
  if (!body.ok) return body.response;
  return withTimetableErrors(async () => {
    const updated = await updateClass(guard.value.user.schoolId, guard.value.board.id, id, body.value);
    if (!updated) return notFoundResponse();
    return NextResponse.json(ClassResponseSchema.parse({ class: updated }));
  });
}
