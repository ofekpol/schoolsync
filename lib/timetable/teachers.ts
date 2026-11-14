import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { staffUsers } from "@/lib/db/schema";
import { ttTeachers } from "@/lib/db/schema-timetable";
import { MAX_TEACHERS } from "@/lib/validations/timetable";
import { assertBoard } from "./boards";
import { cleanNames, mapPgError, TimetableError, type Tx } from "./errors";

export interface TtTeacher {
  id: string;
  fullName: string;
  staffUserId: string | null;
  freeDayEntitled: boolean;
}

export interface TeacherPatch {
  fullName?: string;
  freeDayEntitled?: boolean;
  staffUserId?: string | null;
}

const columns = {
  id: ttTeachers.id,
  fullName: ttTeachers.fullName,
  staffUserId: ttTeachers.staffUserId,
  freeDayEntitled: ttTeachers.freeDayEntitled,
};

/** The board's teachers, by name. */
export function listTeachers(schoolId: string, boardId: string): Promise<TtTeacher[]> {
  return withSchool(schoolId, (tx) =>
    tx.select(columns).from(ttTeachers).where(eq(ttTeachers.boardId, boardId)).orderBy(asc(ttTeachers.fullName)),
  );
}

async function assertRoom(tx: Tx, boardId: string, adding: number): Promise<void> {
  const rows = await tx.select({ id: ttTeachers.id }).from(ttTeachers).where(eq(ttTeachers.boardId, boardId));
  if (rows.length + adding > MAX_TEACHERS) throw new TimetableError("limit_reached");
}

/** Adds one teacher per name (trimmed, blanks and repeats dropped). Teachers may share a name. */
export function addTeachers(schoolId: string, boardId: string, names: string[]): Promise<TtTeacher[]> {
  const cleaned = cleanNames(names);
  return withSchool(schoolId, async (tx) => {
    await assertBoard(tx, boardId);
    if (cleaned.length === 0) return [];
    await assertRoom(tx, boardId, cleaned.length);
    return tx
      .insert(ttTeachers)
      .values(cleaned.map((fullName) => ({ schoolId, boardId, fullName })))
      .returning(columns);
  });
}

/** Active staff of the school among `ids` (RLS hides every other school's). */
async function activeStaff(tx: Tx, ids: string[]): Promise<Array<{ id: string; fullName: string }>> {
  if (ids.length === 0) return [];
  return tx
    .select({ id: staffUsers.id, fullName: staffUsers.fullName })
    .from(staffUsers)
    .where(and(inArray(staffUsers.id, ids), eq(staffUsers.status, "active")));
}

/**
 * Adds a teacher per staff user, named as the staff user. unknown_id when an id
 * is not active staff of this school; staff already on the board are skipped.
 */
export function addTeachersFromStaff(
  schoolId: string,
  boardId: string,
  staffUserIds: string[],
): Promise<TtTeacher[]> {
  const ids = [...new Set(staffUserIds)];
  return withSchool(schoolId, async (tx) => {
    await assertBoard(tx, boardId);
    const staff = await activeStaff(tx, ids);
    if (staff.length !== ids.length) throw new TimetableError("unknown_id");
    const linked = await tx
      .select({ staffUserId: ttTeachers.staffUserId })
      .from(ttTeachers)
      .where(and(eq(ttTeachers.boardId, boardId), isNotNull(ttTeachers.staffUserId)));
    const taken = new Set(linked.map((row) => row.staffUserId));
    const byId = new Map(staff.map((row) => [row.id, row.fullName]));
    const fresh = ids.filter((id) => !taken.has(id));
    if (fresh.length === 0) return [];
    await assertRoom(tx, boardId, fresh.length);
    return tx
      .insert(ttTeachers)
      .values(fresh.map((id) => ({ schoolId, boardId, fullName: byId.get(id) ?? "", staffUserId: id })))
      .returning(columns);
  });
}

/** already_linked when the staff user is another teacher on the same board. */
export function updateTeacher(schoolId: string, id: string, patch: TeacherPatch): Promise<TtTeacher | null> {
  return withSchool(schoolId, async (tx) => {
    if (patch.staffUserId) {
      const staff = await activeStaff(tx, [patch.staffUserId]);
      if (staff.length === 0) throw new TimetableError("unknown_id");
    }
    const set = { ...patch, ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}) };
    if (Object.keys(set).length === 0) {
      const [row] = await tx.select(columns).from(ttTeachers).where(eq(ttTeachers.id, id));
      return row ?? null;
    }
    const [row] = await tx.update(ttTeachers).set(set).where(eq(ttTeachers.id, id)).returning(columns);
    return row ?? null;
  }).catch((error: unknown) => mapPgError(error, { unique: "already_linked" }));
}

/** False when not found; in_use when a lesson block uses the teacher. */
export function deleteTeacher(schoolId: string, id: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx.delete(ttTeachers).where(eq(ttTeachers.id, id)).returning({ id: ttTeachers.id });
    return rows.length > 0;
  }).catch((error: unknown) => mapPgError(error, { fk: "in_use" }));
}
