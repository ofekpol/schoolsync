import { NextRequest, NextResponse } from "next/server";
import { deleteConstraint, replaceConstraint } from "@/lib/timetable/constraints/crud";
import { ConstraintInputSchema } from "@/lib/timetable/constraints/registry";
import {
  invalidInput,
  itemId,
  notFoundResponse,
  readBody,
  requireBoard,
  withTimetableErrors,
} from "@/lib/timetable/api-guard";
import { ConstraintResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string; id: string }> };

/** PUT — replaces a constraint's hard/soft, weight and params; its type stays (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const body = await readBody(request, ConstraintInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const constraint = await replaceConstraint(user.schoolId, board.id, id, body.value);
    if (!constraint) return notFoundResponse();
    return NextResponse.json(ConstraintResponseSchema.parse({ constraint }));
  });
}

/** DELETE — removes a constraint (admin). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const id = await itemId(params);
  if (!id) return invalidInput();
  const deleted = await deleteConstraint(guard.value.user.schoolId, guard.value.board.id, id);
  return deleted ? new NextResponse(null, { status: 204 }) : notFoundResponse();
}
