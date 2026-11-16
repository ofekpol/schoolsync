import { z } from "zod";
import { classNoGaps } from "./class_no_gaps";
import type { ConstraintType, ConstraintTypeDef } from "./define";
import { MAX_WEIGHT } from "./limits";
import { meeting } from "./meeting";
import { subjectMaxPerDay } from "./subject_max_per_day";
import { teacherFewGaps } from "./teacher_few_gaps";
import { teacherFreeDay } from "./teacher_free_day";
import { teacherUnavailable } from "./teacher_unavailable";

export type { ConstraintType, ConstraintTypeDef, ExportContext, SolverPart } from "./define";

/** Every constraint type; adding one = one file + one line here (+ its solver encoder). */
export const CONSTRAINT_TYPES = {
  teacher_free_day: teacherFreeDay,
  teacher_unavailable: teacherUnavailable,
  meeting,
  subject_max_per_day: subjectMaxPerDay,
  class_no_gaps: classNoGaps,
  teacher_few_gaps: teacherFewGaps,
} satisfies Record<ConstraintType, ConstraintTypeDef<unknown>>;

const common = {
  hard: z.boolean(),
  weight: z.number().int().min(1).max(MAX_WEIGHT),
  teacherId: z.string().uuid().optional(),
};
const variant = <T extends ConstraintType, P extends z.ZodTypeAny>(type: T, params: P) =>
  z.object({ type: z.literal(type), ...common, params }).strict();

/** A constraint as entered: type, hard/soft, weight, the row's teacher (free day only) and params. */
export const ConstraintInputSchema = z
  .discriminatedUnion("type", [
    variant("teacher_free_day", teacherFreeDay.params),
    variant("teacher_unavailable", teacherUnavailable.params),
    variant("meeting", meeting.params),
    variant("subject_max_per_day", subjectMaxPerDay.params),
    variant("class_no_gaps", classNoGaps.params),
    variant("teacher_few_gaps", teacherFewGaps.params),
  ])
  .superRefine((input, ctx) => {
    const def: ConstraintTypeDef<unknown> = CONSTRAINT_TYPES[input.type];
    if (def.perTeacher !== (input.teacherId !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["teacherId"], message: def.perTeacher ? "teacher_required" : "teacher_not_allowed" });
    }
    if ((def.hardness === "hard" && !input.hard) || (def.hardness === "soft" && input.hard)) {
      ctx.addIssue({ code: "custom", path: ["hard"], message: "hardness_not_allowed" });
    }
  });
export type ConstraintInput = z.infer<typeof ConstraintInputSchema>;
