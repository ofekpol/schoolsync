import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { ttBoards } from "@/lib/db/schema-timetable";
import { MAX_BOARDS } from "@/lib/validations/timetable";
import { mapPgError, TimetableError, type Tx } from "./errors";
import { DEFAULT_WEEK, WeekSchema, type Week } from "./week";

export type BoardStatus = "setup" | "collecting" | "review" | "published";

export interface Board {
  id: string;
  name: string;
  status: BoardStatus;
  week: Week;
  academicYearId: string;
}

function toBoard(row: typeof ttBoards.$inferSelect): Board {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    week: WeekSchema.parse(row.week),
    academicYearId: row.academicYearId,
  };
}

/**
 * Throws unknown_id unless the board is visible in `tx` (RLS: this school's).
 * Writes must call it: foreign-key checks ignore RLS, so a board id of another
 * school would otherwise be accepted.
 */
export async function assertBoard(tx: Tx, boardId: string): Promise<void> {
  const rows = await tx.select({ id: ttBoards.id }).from(ttBoards).where(eq(ttBoards.id, boardId)).limit(1);
  if (rows.length === 0) throw new TimetableError("unknown_id");
}

/** A new board for the school's active academic year, starting from DEFAULT_WEEK. */
export async function createBoard(schoolId: string, name: string): Promise<Board> {
  // `schools` is not readable inside withSchool (migration 0010).
  const academicYearId = await getActiveAcademicYearId(schoolId);
  if (!academicYearId) throw new TimetableError("no_active_year");
  return withSchool(schoolId, async (tx) => {
    const [{ count, clash }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        clash: sql<boolean>`coalesce(bool_or(${ttBoards.name} = ${name}), false)`,
      })
      .from(ttBoards);
    if (clash) throw new TimetableError("duplicate_name");
    if (count >= MAX_BOARDS) throw new TimetableError("limit_reached");
    const [row] = await tx
      .insert(ttBoards)
      .values({ schoolId, academicYearId, name, week: DEFAULT_WEEK })
      .returning();
    return toBoard(row);
  }).catch((error: unknown) => mapPgError(error, { unique: "duplicate_name" }));
}

/** The school's boards, newest first. */
export function listBoards(schoolId: string): Promise<Board[]> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx.select().from(ttBoards).orderBy(desc(ttBoards.createdAt));
    return rows.map(toBoard);
  });
}

export function getBoard(schoolId: string, boardId: string): Promise<Board | null> {
  return withSchool(schoolId, async (tx) => {
    const [row] = await tx.select().from(ttBoards).where(eq(ttBoards.id, boardId)).limit(1);
    return row ? toBoard(row) : null;
  });
}

/** Deletes the board and everything on it (cascade). False when not found. */
export function deleteBoard(schoolId: string, boardId: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx.delete(ttBoards).where(eq(ttBoards.id, boardId)).returning({ id: ttBoards.id });
    return rows.length > 0;
  });
}
