import "server-only";
import { listStaffLabels } from "@/lib/profile/staff-labels";
import type { SolverBlock, SolverConstraint } from "../solver-contract";
import type { TtTeacher } from "../teachers";
import { listConstraints } from "./crud";
import { CONSTRAINT_TYPES, type ConstraintTypeDef, type ExportContext } from "./registry";
import { resolveTarget } from "./target";

export interface SkippedConstraint {
  constraintId: string;
  reason: "reaches_no_one" | "not_entitled";
}

export interface ExportedConstraints {
  constraints: SolverConstraint[];
  /** One class-less block per meeting; its id is the constraint's id. */
  meetingBlocks: SolverBlock[];
  skipped: SkippedConstraint[];
}

/**
 * The board's constraints as the solver receives them: labels resolved to the
 * board teachers who hold them, meetings turned into blocks, and the ones that
 * would reach no one (or a teacher no longer entitled) left out and listed.
 */
export async function exportConstraints(
  schoolId: string,
  boardId: string,
  teachers: TtTeacher[],
): Promise<ExportedConstraints> {
  const [rows, labels] = await Promise.all([listConstraints(schoolId, boardId), listStaffLabels(schoolId)]);
  const entitled = new Map(teachers.map((t) => [t.id, t.freeDayEntitled]));
  const out: ExportedConstraints = { constraints: [], meetingBlocks: [], skipped: [] };
  for (const row of rows) {
    const ctx: ExportContext = {
      teacherId: row.teacherId,
      resolve: (target) => resolveTarget(target, teachers, labels),
      entitled: (id) => entitled.get(id) === true,
    };
    const def: ConstraintTypeDef<unknown> = CONSTRAINT_TYPES[row.type];
    const part = def.toSolver(row.params, ctx);
    if (part.kind === "skip") out.skipped.push({ constraintId: row.id, reason: part.reason });
    else if (part.kind === "block") {
      const { teacherIds, weeklyPeriods, consecutive } = part;
      out.meetingBlocks.push({ id: row.id, subjectId: null, classIds: [], teacherIds, weeklyPeriods, consecutive });
    } else {
      out.constraints.push({ id: row.id, type: row.type, hard: row.hard, weight: row.weight, params: part.params });
    }
  }
  return out;
}
