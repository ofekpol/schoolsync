import { NextRequest, NextResponse } from "next/server";
import { listTeachers } from "@/lib/timetable/teachers";
import { createConstraint, listConstraints } from "@/lib/timetable/constraints/crud";
import { exportConstraints } from "@/lib/timetable/constraints/export";
import { ConstraintInputSchema } from "@/lib/timetable/constraints/registry";
import { readBody, requireBoard, withTimetableErrors } from "@/lib/timetable/api-guard";
import { ConstraintResponseSchema, ConstraintsResponseSchema } from "@/lib/validations/timetable-api";

type RouteContext = { params: Promise<{ board: string }> };

/** GET — the board's constraints, and which of them the solver would not receive (admin). */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(false, params);
  if (!guard.ok) return guard.response;
  const { user, board } = guard.value;
  const [constraints, teachers] = await Promise.all([
    listConstraints(user.schoolId, board.id),
    listTeachers(user.schoolId, board.id),
  ]);
  const { skipped } = await exportConstraints(user.schoolId, board.id, teachers);
  return NextResponse.json(ConstraintsResponseSchema.parse({ constraints, skipped }));
}

/** POST — a constraint entered by management (admin). */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const guard = await requireBoard(true, params);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, ConstraintInputSchema);
  if (!body.ok) return body.response;
  const { user, board } = guard.value;
  return withTimetableErrors(async () => {
    const constraint = await createConstraint(user.schoolId, board.id, body.value, {
      staffUserId: user.id,
      source: "management",
    });
    return NextResponse.json(ConstraintResponseSchema.parse({ constraint }), { status: 201 });
  });
}
