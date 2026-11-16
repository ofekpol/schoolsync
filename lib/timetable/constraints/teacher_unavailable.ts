import { z } from "zod";
import { defineType } from "./define";
import { MAX_PERIOD } from "./limits";
import { TargetSchema } from "./target";

const periods = z
  .array(z.number().int().min(1).max(MAX_PERIOD))
  .min(1)
  .refine((list) => new Set(list).size === list.length, { message: "duplicate_period" });

/** Teachers who cannot teach on a day (the whole day, or only some periods). */
export const teacherUnavailable = defineType({
  type: "teacher_unavailable",
  params: z.object({ target: TargetSchema, day: z.number().int().min(0).max(6), periods: periods.optional() }).strict(),
  hardness: "either",
  defaultWeight: 100,
  perTeacher: false,
  encode: ({ target, day, periods: list }, ctx) => {
    const teacherIds = ctx.resolve(target);
    if (teacherIds.length === 0) return { kind: "skip", reason: "reaches_no_one" };
    return { kind: "constraint", params: list ? { teacherIds, day, periods: list } : { teacherIds, day } };
  },
});
