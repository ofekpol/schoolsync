import { z } from "zod";

/** One school grade, 7 (ז) to 12 (יב). */
export const GradeSchema = z.number().int().min(7).max(12);
