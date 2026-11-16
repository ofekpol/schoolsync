import { z } from "zod";
import { defineType } from "./define";

/** A teacher's free day (entered by the teacher, or by management for them). Needs entitlement. */
export const teacherFreeDay = defineType({
  type: "teacher_free_day",
  params: z.object({ day: z.number().int().min(0).max(6) }).strict(),
  hardness: "hard",
  defaultWeight: 100,
  perTeacher: true,
  encode: ({ day }, ctx) => {
    if (!ctx.teacherId || !ctx.entitled(ctx.teacherId)) return { kind: "skip", reason: "not_entitled" };
    return { kind: "constraint", params: { teacherIds: [ctx.teacherId], day } };
  },
});
