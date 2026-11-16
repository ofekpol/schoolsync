import { z } from "zod";
import { defineType } from "./define";

/** Teachers have as few empty periods between lessons as possible (soft, whole board). */
export const teacherFewGaps = defineType({
  type: "teacher_few_gaps",
  params: z.object({}).strict(),
  hardness: "soft",
  defaultWeight: 10,
  perTeacher: false,
  encode: () => ({ kind: "constraint", params: {} }),
});
