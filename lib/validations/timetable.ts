import { z } from "zod";

export const MAX_BOARDS = 10;
export const MAX_CLASSES_PER_GRADE = 15;
export const MAX_SUBJECTS = 80;
export const MAX_TEACHERS = 400;
export const MAX_WEEKLY_PERIODS = 12;
export const MAX_NAME_LENGTH = 60;
export const MAX_CLASS_KIND_LENGTH = 30;

export const MIN_GRADE = 7;
export const MAX_GRADE = 12;

export const TimetableNameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);

const uniqueIds = (max: number, min: number) =>
  z
    .array(z.string().uuid())
    .min(min)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate_id" });

/** One lesson block: one class = an ordinary lesson, two or more = a Plata. */
export const BlockInputSchema = z.object({
  subjectId: z.string().uuid(),
  weeklyPeriods: z.number().int().min(1).max(MAX_WEEKLY_PERIODS),
  classIds: uniqueIds(MAX_CLASSES_PER_GRADE, 1),
  teacherIds: uniqueIds(MAX_CLASSES_PER_GRADE, 0),
  /** A cluster's group name per teacher id; "" = no name. Names of teachers not in the block are ignored. */
  groupNames: z
    .record(z.string().uuid(), z.string().trim().max(MAX_NAME_LENGTH))
    .refine((names) => Object.keys(names).length <= MAX_CLASSES_PER_GRADE, { message: "too_many" })
    .optional(),
});
export type BlockInput = z.infer<typeof BlockInputSchema>;

/** One subject's weekly periods for every class of a grade (lessons and Plata alike). */
export const GradePeriodsInputSchema = z.object({
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE),
  subjectId: z.string().uuid(),
  weeklyPeriods: z.number().int().min(1).max(MAX_WEEKLY_PERIODS),
});
export type GradePeriodsInput = z.infer<typeof GradePeriodsInputSchema>;

/** The class to take out of a Plata. */
export const DetachClassInputSchema = z.object({ classId: z.string().uuid() });
