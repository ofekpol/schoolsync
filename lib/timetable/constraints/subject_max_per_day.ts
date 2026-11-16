import { z } from "zod";
import { defineType } from "./define";
import { MAX_SUBJECT_PER_DAY } from "./limits";

/** No class has more than `max` periods of one subject on a day (whole board). */
export const subjectMaxPerDay = defineType({
  type: "subject_max_per_day",
  params: z.object({ max: z.number().int().min(1).max(MAX_SUBJECT_PER_DAY) }).strict(),
  hardness: "either",
  defaultWeight: 50,
  perTeacher: false,
  encode: ({ max }) => ({ kind: "constraint", params: { max } }),
});
