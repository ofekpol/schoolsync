import "server-only";
import { asc, eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttSubjects } from "@/lib/db/schema-timetable";
import { MAX_SUBJECTS } from "@/lib/validations/timetable";
import { assertBoard } from "./boards";
import { cleanNames, mapPgError, TimetableError } from "./errors";

export interface TtSubject {
  id: string;
  name: string;
}

const columns = { id: ttSubjects.id, name: ttSubjects.name };

/** The board's subjects, by name. */
export function listSubjects(schoolId: string, boardId: string): Promise<TtSubject[]> {
  return withSchool(schoolId, (tx) =>
    tx.select(columns).from(ttSubjects).where(eq(ttSubjects.boardId, boardId)).orderBy(asc(ttSubjects.name)),
  );
}

/**
 * Adds the names not already on the board (trimmed, blanks and repeats dropped).
 * Returns only the subjects it created.
 */
export function addSubjects(schoolId: string, boardId: string, names: string[]): Promise<TtSubject[]> {
  const cleaned = cleanNames(names);
  return withSchool(schoolId, async (tx) => {
    await assertBoard(tx, boardId);
    const existing = await tx.select({ name: ttSubjects.name }).from(ttSubjects).where(eq(ttSubjects.boardId, boardId));
    const taken = new Set(existing.map((row) => row.name));
    const fresh = cleaned.filter((name) => !taken.has(name));
    if (fresh.length === 0) return [];
    if (existing.length + fresh.length > MAX_SUBJECTS) throw new TimetableError("limit_reached");
    return tx
      .insert(ttSubjects)
      .values(fresh.map((name) => ({ schoolId, boardId, name })))
      .returning(columns);
  });
}

export function renameSubject(schoolId: string, id: string, name: string): Promise<TtSubject | null> {
  return withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .update(ttSubjects)
      .set({ name: name.trim() })
      .where(eq(ttSubjects.id, id))
      .returning(columns);
    return row ?? null;
  }).catch((error: unknown) => mapPgError(error, { unique: "duplicate_name" }));
}

/** False when not found; in_use when a lesson block uses it. */
export function deleteSubject(schoolId: string, id: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx.delete(ttSubjects).where(eq(ttSubjects.id, id)).returning({ id: ttSubjects.id });
    return rows.length > 0;
  }).catch((error: unknown) => mapPgError(error, { fk: "in_use" }));
}

