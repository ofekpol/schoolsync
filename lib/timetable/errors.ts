import type { withSchool } from "@/lib/db/client";

/** A transaction handle inside withSchool. */
export type Tx = Parameters<Parameters<typeof withSchool>[1]>[0];

export type TimetableErrorCode =
  | "no_active_year"
  | "duplicate_name"
  | "limit_reached"
  | "in_use"
  | "unknown_id"
  | "mixed_grades"
  | "duplicate_lesson"
  | "already_linked";

/** A timetable write the caller can explain to the user. */
export class TimetableError extends Error {
  constructor(readonly code: TimetableErrorCode) {
    super(code);
    this.name = "TimetableError";
  }
}

/** The Postgres error code anywhere in the cause chain (drizzle wraps pg errors). */
export function pgErrorCode(error: unknown): string | null {
  for (let current = error; current instanceof Object; current = (current as { cause?: unknown }).cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

/** Rethrows a pg error as a TimetableError when it maps to one. */
export function mapPgError(error: unknown, codes: { fk?: TimetableErrorCode; unique?: TimetableErrorCode }): never {
  const code = pgErrorCode(error);
  if (code === FOREIGN_KEY_VIOLATION && codes.fk) throw new TimetableError(codes.fk);
  if (code === UNIQUE_VIOLATION && codes.unique) throw new TimetableError(codes.unique);
  throw error;
}

/** Trims, drops blanks and drops repeats, keeping first-seen order. */
export function cleanNames(names: string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 0))];
}
