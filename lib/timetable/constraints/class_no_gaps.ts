import { z } from "zod";
import { defineType } from "./define";

/** No class has an empty period between two lessons on a day (whole board). */
export const classNoGaps = defineType({
  type: "class_no_gaps",
  params: z.object({}).strict(),
  hardness: "either",
  defaultWeight: 50,
  perTeacher: false,
  encode: () => ({ kind: "constraint", params: {} }),
});
