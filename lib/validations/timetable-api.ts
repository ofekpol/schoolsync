import { z } from "zod";
import { WeekSchema } from "@/lib/timetable/week";
import {
  BlockInputSchema,
  MAX_CLASSES_PER_GRADE,
  MAX_GRADE,
  MAX_TEACHERS,
  MIN_GRADE,
  TimetableNameSchema,
} from "./timetable";

/** Request and response shapes of the /api/v1/timetable routes (plan 5b). */

const id = z.string().uuid();
const MAX_PASTED_NAMES = 200;

export const BoardSchema = z.object({
  id,
  name: z.string(),
  status: z.enum(["setup", "collecting", "review", "published"]),
  week: WeekSchema,
  academicYearId: id,
});
export const TtClassSchema = z.object({ id, grade: z.number().int(), number: z.number().int() });
export const TtSubjectSchema = z.object({ id, name: z.string() });
export const TtTeacherSchema = z.object({
  id,
  fullName: z.string(),
  staffUserId: id.nullable(),
  freeDayEntitled: z.boolean(),
});
export const TtBlockSchema = z.object({
  id,
  subjectId: id,
  weeklyPeriods: z.number().int(),
  classIds: z.array(id),
  teacherIds: z.array(id),
});
export const InputProblemSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("block_without_teacher"), blockId: id }),
  z.object({ code: z.literal("class_overbooked"), classId: id, periods: z.number(), slots: z.number() }),
  z.object({ code: z.literal("teacher_overbooked"), teacherId: id, periods: z.number(), slots: z.number() }),
]);

export const BoardsResponseSchema = z.object({ boards: z.array(BoardSchema) });
export const BoardResponseSchema = z.object({ board: BoardSchema });
export const BoardDetailResponseSchema = z.object({ board: BoardSchema, problems: z.array(InputProblemSchema) });
export const ClassesResponseSchema = z.object({ classes: z.array(TtClassSchema) });
export const SubjectsResponseSchema = z.object({ subjects: z.array(TtSubjectSchema) });
export const SubjectResponseSchema = z.object({ subject: TtSubjectSchema });
export const CreatedSubjectsSchema = z.object({ created: z.array(TtSubjectSchema) });
export const TeachersResponseSchema = z.object({ teachers: z.array(TtTeacherSchema) });
export const TeacherResponseSchema = z.object({ teacher: TtTeacherSchema });
export const CreatedTeachersSchema = z.object({ created: z.array(TtTeacherSchema) });
export const BlocksResponseSchema = z.object({ blocks: z.array(TtBlockSchema) });
export const BlockResponseSchema = z.object({ block: TtBlockSchema });

export const BoardNameInputSchema = z.object({ name: TimetableNameSchema });
export const ClassCountInputSchema = z.object({
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE),
  count: z.number().int().min(0).max(MAX_CLASSES_PER_GRADE),
});
const pastedNames = z.array(TimetableNameSchema).min(1).max(MAX_PASTED_NAMES);
export const SubjectNamesInputSchema = z.object({ names: pastedNames });
export const SubjectRenameInputSchema = z.object({ name: TimetableNameSchema });
/** Exactly one of the two: pasted names, or staff users to link. */
export const TeachersInputSchema = z.union([
  z.object({ names: pastedNames }).strict(),
  z.object({ staffUserIds: z.array(id).min(1).max(MAX_TEACHERS) }).strict(),
]);
export const TeacherPatchInputSchema = z
  .object({
    fullName: TimetableNameSchema.optional(),
    freeDayEntitled: z.boolean().optional(),
    staffUserId: id.nullable().optional(),
  })
  .strict();
export { BlockInputSchema };
