import { z } from "zod";
import { defineType } from "./define";
import { MAX_MEETING_PERIODS } from "./limits";
import { TargetSchema } from "./target";

/**
 * Teachers who share weekly meeting periods. Not a solver rule: the export adds
 * a lesson block with no classes. consecutive = all periods back to back on one day.
 */
export const meeting = defineType({
  type: "meeting",
  params: z
    .object({
      target: TargetSchema,
      weeklyPeriods: z.number().int().min(1).max(MAX_MEETING_PERIODS),
      consecutive: z.boolean(),
    })
    .strict(),
  hardness: "hard",
  defaultWeight: 100,
  perTeacher: false,
  encode: ({ target, weeklyPeriods, consecutive }, ctx) => {
    const teacherIds = ctx.resolve(target);
    if (teacherIds.length === 0) return { kind: "skip", reason: "reaches_no_one" };
    return { kind: "block", teacherIds, weeklyPeriods, consecutive };
  },
});
