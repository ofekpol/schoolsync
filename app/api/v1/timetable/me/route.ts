import { NextResponse } from "next/server";
import { listMyBoards } from "@/lib/timetable/constraints/me";
import { requireTimetableStaff } from "@/lib/timetable/api-guard";
import { MyBoardsResponseSchema } from "@/lib/validations/timetable-api";

/** GET — the collecting boards on which the signed-in staff user teaches (any role). */
export async function GET(): Promise<NextResponse> {
  const guard = await requireTimetableStaff(false);
  if (!guard.ok) return guard.response;
  const boards = await listMyBoards(guard.value.schoolId, guard.value.id);
  return NextResponse.json(MyBoardsResponseSchema.parse({ boards }));
}
