import type { TtBlock } from "@/lib/timetable/blocks";
import type { TtClass } from "@/lib/timetable/classes";
import type { TtSubject } from "@/lib/timetable/subjects";

export type Cell = { kind: "empty" } | { kind: "lesson"; block: TtBlock } | { kind: "plata"; block: TtBlock };

export const cellKey = (classId: string, subjectId: string) => `${classId}:${subjectId}`;

/** Every class × subject cell: its ordinary lesson, the Plata it is in, or empty. */
export function buildLessonsGrid(classes: TtClass[], subjects: TtSubject[], blocks: TtBlock[]): Map<string, Cell> {
  const grid = new Map<string, Cell>();
  for (const c of classes) for (const s of subjects) grid.set(cellKey(c.id, s.id), { kind: "empty" });
  for (const block of blocks) {
    const kind = block.classIds.length > 1 ? "plata" : "lesson";
    for (const classId of block.classIds) {
      const key = cellKey(classId, block.subjectId);
      if (grid.has(key)) grid.set(key, { kind, block });
    }
  }
  return grid;
}

/** Weekly periods per class; a Plata counts once for each class in it. */
export function classTotals(classes: TtClass[], blocks: TtBlock[]): Map<string, number> {
  const totals = new Map(classes.map((c) => [c.id, 0]));
  for (const block of blocks) {
    for (const classId of block.classIds) {
      if (totals.has(classId)) totals.set(classId, (totals.get(classId) ?? 0) + block.weeklyPeriods);
    }
  }
  return totals;
}

/** Teacher names for a picker; repeated names get " (2)", " (3)" so each is unique. */
export function teacherOptions(teachers: Array<{ id: string; fullName: string }>): Array<{ id: string; label: string }> {
  const seen = new Map<string, number>();
  return teachers.map((teacher) => {
    const n = (seen.get(teacher.fullName) ?? 0) + 1;
    seen.set(teacher.fullName, n);
    return { id: teacher.id, label: n === 1 ? teacher.fullName : `${teacher.fullName} (${n})` };
  });
}

/** A cell's weekly periods: its lesson's or its Plata's, 0 when empty. */
export const cellPeriods = (cell: Cell): number => (cell.kind === "empty" ? 0 : cell.block.weeklyPeriods);

/**
 * Each subject's standard for the grade: the weekly periods most of its classes
 * have (an empty cell counts as 0). A tie goes to the value of the first class.
 */
export function gradeNorms(classes: TtClass[], subjects: TtSubject[], grid: Map<string, Cell>): Map<string, number> {
  const norms = new Map<string, number>();
  for (const subject of subjects) {
    const counts = new Map<number, number>();
    let best = 0;
    let bestCount = 0;
    for (const klass of classes) {
      const cell = grid.get(cellKey(klass.id, subject.id));
      const value = cell ? cellPeriods(cell) : 0;
      const count = (counts.get(value) ?? 0) + 1;
      counts.set(value, count);
      if (count > bestCount) [best, bestCount] = [value, count];
    }
    norms.set(subject.id, best);
  }
  return norms;
}

const touchesGrade = (block: TtBlock, classIds: Set<string>) => block.classIds.some((id) => classIds.has(id));

/**
 * Rows of the homeroom view for a grade: subjects taught in the homeroom class there,
 * plus any subject that already has a lesson or cluster in the grade. So a class left
 * out of a cluster still gets its own cell (the exception), and old data stays visible.
 */
export function homeroomSubjects(subjects: TtSubject[], grade: number, classes: TtClass[], blocks: TtBlock[]): TtSubject[] {
  const ids = new Set(classes.filter((c) => c.grade === grade).map((c) => c.id));
  const used = new Set(blocks.filter((b) => touchesGrade(b, ids)).map((b) => b.subjectId));
  return subjects.filter((s) => !s.groupGrades.includes(grade) || used.has(s.id));
}

/** Subjects a cluster in this grade may use: those taught in groups there, plus `keepId` (the block's own). */
export function groupSubjects(subjects: TtSubject[], grade: number, keepId?: string): TtSubject[] {
  return subjects.filter((s) => s.groupGrades.includes(grade) || s.id === keepId);
}

/**
 * Teachers who teach a subject by their staff profile: linked to a staff user who has
 * a profile option with the subject's name (trimmed, exact).
 */
export function teachersForSubject(
  subjectName: string,
  teachers: Array<{ id: string; staffUserId: string | null }>,
  options: Array<{ id: string; label: string }>,
  labels: Record<string, string[]>,
): string[] {
  const wanted = new Set(options.filter((o) => o.label.trim() === subjectName.trim()).map((o) => o.id));
  if (wanted.size === 0) return [];
  return teachers.flatMap((t) =>
    t.staffUserId && labels[t.staffUserId]?.some((option) => wanted.has(option)) ? [t.id] : [],
  );
}
