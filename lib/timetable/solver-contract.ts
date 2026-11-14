import { z } from "zod";
import { WeekSchema } from "./week";

/**
 * The JSON the app sends to the solver and gets back (version 1). Ids only:
 * no names, emails or labels leave the app. Plan 4 implements the other side;
 * a change here is its own PR that both tracks read.
 */

const id = z.string().uuid();

export const WeightProfileSchema = z.enum(["teachers", "classes", "balanced"]);
export type WeightProfile = z.infer<typeof WeightProfileSchema>;

export const SolverBlockSchema = z.object({
  id,
  subjectId: id.nullable(), // null: a meeting (plan 6)
  weeklyPeriods: z.number().int().min(1),
  classIds: z.array(id),
  teacherIds: z.array(id),
  consecutive: z.boolean(),
});
export type SolverBlock = z.infer<typeof SolverBlockSchema>;

export const SolverConstraintSchema = z.object({
  id,
  type: z.string().min(1),
  hard: z.boolean(),
  weight: z.number().min(0),
  params: z.record(z.string(), z.unknown()),
});
export type SolverConstraint = z.infer<typeof SolverConstraintSchema>;

export const SolverPlacementSchema = z.object({
  blockId: id,
  day: z.number().int().min(0).max(6),
  period: z.number().int().min(1),
  pinned: z.boolean(),
});
export type SolverPlacement = z.infer<typeof SolverPlacementSchema>;

export const SolverInputSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["solve", "evaluate"]),
    profile: WeightProfileSchema,
    timeLimitSeconds: z.number().int().min(1),
    week: WeekSchema,
    classIds: z.array(id),
    teacherIds: z.array(id),
    blocks: z.array(SolverBlockSchema),
    constraints: z.array(SolverConstraintSchema),
    placements: z.array(SolverPlacementSchema),
  })
  .superRefine((input, ctx) => {
    const classes = new Set(input.classIds);
    const teachers = new Set(input.teacherIds);
    const blockIds = new Set(input.blocks.map((block) => block.id));
    if (blockIds.size !== input.blocks.length) ctx.addIssue({ code: "custom", message: "duplicate_block_id" });
    for (const block of input.blocks) {
      if (!block.classIds.every((classId) => classes.has(classId))) {
        ctx.addIssue({ code: "custom", message: "unknown_class", path: ["blocks"] });
      }
      if (!block.teacherIds.every((teacherId) => teachers.has(teacherId))) {
        ctx.addIssue({ code: "custom", message: "unknown_teacher", path: ["blocks"] });
      }
    }
  });
export type SolverInput = z.infer<typeof SolverInputSchema>;

/** constraintId null = a built-in rule: teacher_clash, class_clash or unplaced. */
export const SolverViolationSchema = z.object({
  constraintId: id.nullable(),
  type: z.string(),
  hard: z.boolean(),
  count: z.number().int().min(0),
  teacherIds: z.array(id),
  classIds: z.array(id),
});
export type SolverViolation = z.infer<typeof SolverViolationSchema>;

export const SolverOutputSchema = z.object({
  version: z.literal(1),
  status: z.enum(["ok", "failed"]),
  error: z.string().optional(),
  score: z.number(),
  placements: z.array(SolverPlacementSchema.omit({ pinned: true })),
  violations: z.array(SolverViolationSchema),
});
export type SolverOutput = z.infer<typeof SolverOutputSchema>;
