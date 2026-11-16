const VALID_GRADES = new Set<number>(SCHOOL_GRADES);
import { SCHOOL_GRADES } from "@/lib/grades";

export interface DashboardGradeSelection {
  selectedGrades: number[];
  dataGrades: number[];
}

export function getDashboardGradeSelection(
  allowedGrades: number[],
  rawGrades: string | string[] | undefined,
): DashboardGradeSelection {
  const allowed = normalizeAllowedGrades(allowedGrades);
  const requested = parseGradeParams(rawGrades);

  return {
    // Focus selection: empty means "no focus" (every allowed grade shown).
    selectedGrades: requested.filter((grade) => allowed.includes(grade)),
    dataGrades: allowed,
  };
}

/** Weekly rows: the focused grades, or every allowed grade when nothing is focused. */
export function visibleWeeklyGrades(allowedGrades: number[], selectedGrades: number[]): number[] {
  const allowed = normalizeAllowedGrades(allowedGrades);
  const selected = selectedGrades.filter((grade) => allowed.includes(grade));
  return selected.length > 0 ? selected : allowed;
}

export function shouldShowDashboardGradeFilter(allowedGrades: number[]): boolean {
  return normalizeAllowedGrades(allowedGrades).length > 1;
}

function normalizeAllowedGrades(grades: number[]): number[] {
  const unique = grades.filter((grade) => VALID_GRADES.has(grade));
  return Array.from(new Set(unique)).sort((a, b) => a - b);
}

function parseGradeParams(rawGrades: string | string[] | undefined): number[] {
  const values = Array.isArray(rawGrades) ? rawGrades : rawGrades ? [rawGrades] : [];
  const parsed = values
    .flatMap((value) => value.split(","))
    .map((value) => Number(value))
    .filter((grade) => Number.isInteger(grade) && VALID_GRADES.has(grade));

  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}
