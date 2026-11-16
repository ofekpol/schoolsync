import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import type { StaffUserRecord } from "@/lib/db/staff";
import { getBoard, type Board } from "./boards";
import { TimetableError, type TimetableErrorCode } from "./errors";
import { ConstraintError, type ConstraintErrorCode } from "./constraints/errors";

type SchoolUser = StaffUserRecord & { schoolId: string };
type Guarded<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
export const notFoundResponse = () => NextResponse.json({ error: "Not found" }, { status: 404 });
export const invalidInput = (details?: unknown) =>
  NextResponse.json({ error: "Invalid input", details }, { status: 400 });

/**
 * The signed-in active admin of a school with the timeTable service, or the
 * 401/403 to return. Writes are off for demo users.
 */
export async function requireTimetableAdmin(write: boolean): Promise<Guarded<SchoolUser>> {
  const user = await getStaffUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.schoolId) return { ok: false, response: forbidden() };
  const disabled = await serviceDisabledResponse(user.schoolId, "timetable");
  if (disabled) return { ok: false, response: disabled };
  if (user.status !== "active" || user.role !== "admin") return { ok: false, response: forbidden() };
  if (write && isDemoUser(user)) return { ok: false, response: demoDisabledResponse() };
  return { ok: true, value: user as SchoolUser };
}

/** The guard plus the route's `[board]`: 404 unless it is one of the school's boards. */
export async function requireBoard(
  write: boolean,
  params: Promise<{ board: string }>,
): Promise<Guarded<{ user: SchoolUser; board: Board }>> {
  const guard = await requireTimetableAdmin(write);
  if (!guard.ok) return guard;
  const boardId = z.string().uuid().safeParse((await params).board);
  const board = boardId.success ? await getBoard(guard.value.schoolId, boardId.data) : null;
  if (!board) return { ok: false, response: notFoundResponse() };
  return { ok: true, value: { user: guard.value, board } };
}

/** A path id, or null when it is not a uuid. */
export async function itemId(params: Promise<{ id: string }>): Promise<string | null> {
  const parsed = z.string().uuid().safeParse((await params).id);
  return parsed.success ? parsed.data : null;
}

const STATUS: Record<TimetableErrorCode, number> = {
  duplicate_name: 409,
  in_use: 409,
  already_linked: 409,
  limit_reached: 422,
  no_active_year: 422,
  unknown_id: 400,
  mixed_grades: 400,
  duplicate_lesson: 400,
};

const CONSTRAINT_STATUS: Record<ConstraintErrorCode, number> = {
  unknown_id: 400,
  not_entitled: 400,
  type_changed: 400,
  duplicate_free_day: 409,
  wrong_status: 409,
  limit_reached: 422,
  deadline_past: 422,
};

/** The response for a TimetableError or ConstraintError, `{ error: code }`; null for anything else. */
export function timetableErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof TimetableError) return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
  if (error instanceof ConstraintError) {
    return NextResponse.json({ error: error.code }, { status: CONSTRAINT_STATUS[error.code] });
  }
  return null;
}

/** Runs a write, turning a TimetableError into its response. */
export async function withTimetableErrors(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    const failure = timetableErrorResponse(error);
    if (failure) return failure;
    throw error;
  }
}

/** Parses a JSON body with `schema`; the 400 to return on failure. */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { ok: false, response: invalidInput(parsed.error.flatten()) };
  return { ok: true, value: parsed.data };
}
