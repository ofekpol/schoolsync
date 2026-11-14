import type { SolverInput } from "./solver-contract";
import { slotCount } from "./week";

/** Something that makes a board unsolvable as entered; the export still returns. */
export type InputProblem =
  | { code: "block_without_teacher"; blockId: string }
  | { code: "class_overbooked"; classId: string; periods: number; slots: number }
  | { code: "teacher_overbooked"; teacherId: string; periods: number; slots: number };

function periodsPer(input: SolverInput, key: "classIds" | "teacherIds"): Map<string, number> {
  const totals = new Map<string, number>();
  for (const block of input.blocks) {
    for (const memberId of block[key]) totals.set(memberId, (totals.get(memberId) ?? 0) + block.weeklyPeriods);
  }
  return totals;
}

/** Blocks with no teacher, and classes or teachers with more periods than the week has slots. */
export function findInputProblems(input: SolverInput): InputProblem[] {
  const slots = slotCount(input.week);
  const problems: InputProblem[] = input.blocks
    .filter((block) => block.subjectId !== null && block.teacherIds.length === 0)
    .map((block) => ({ code: "block_without_teacher", blockId: block.id }));
  for (const [classId, periods] of periodsPer(input, "classIds")) {
    if (periods > slots) problems.push({ code: "class_overbooked", classId, periods, slots });
  }
  for (const [teacherId, periods] of periodsPer(input, "teacherIds")) {
    if (periods > slots) problems.push({ code: "teacher_overbooked", teacherId, periods, slots });
  }
  return problems;
}
