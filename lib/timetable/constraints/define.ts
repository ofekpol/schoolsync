import type { z } from "zod";
import type { Target } from "./target";

export type ConstraintType =
  | "teacher_free_day"
  | "teacher_unavailable"
  | "meeting"
  | "subject_max_per_day"
  | "class_no_gaps"
  | "teacher_few_gaps";

export interface ExportContext {
  /** The row's teacher (per-teacher types only). */
  teacherId: string | null;
  resolve(target: Target): string[];
  entitled(teacherId: string): boolean;
}

export type SolverPart =
  | { kind: "constraint"; params: Record<string, unknown> }
  | { kind: "block"; teacherIds: string[]; weeklyPeriods: number; consecutive: boolean }
  | { kind: "skip"; reason: "reaches_no_one" | "not_entitled" };

export interface ConstraintTypeDef<P = unknown> {
  type: ConstraintType;
  params: z.ZodType<P>;
  /** What the form may choose. */
  hardness: "hard" | "soft" | "either";
  defaultWeight: number;
  /** True: the row carries teacher_id and params hold no target. */
  perTeacher: boolean;
  /** Stored params (parsed here) to what the solver receives. */
  toSolver(params: unknown, ctx: ExportContext): SolverPart;
}

/** Builds a type definition whose toSolver parses stored params first. */
export function defineType<P>(def: Omit<ConstraintTypeDef<P>, "toSolver"> & {
  encode(params: P, ctx: ExportContext): SolverPart;
}): ConstraintTypeDef<P> {
  const { encode, ...rest } = def;
  return { ...rest, toSolver: (params, ctx) => encode(def.params.parse(params), ctx) };
}
