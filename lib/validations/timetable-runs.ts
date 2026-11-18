import { z } from "zod";
import { WeekSchema } from "@/lib/timetable/week";
import { SolverViolationSchema, WeightProfileSchema } from "@/lib/timetable/solver-contract";

export const SolutionSummarySchema = z.object({
  id: z.string().uuid(),
  profile: WeightProfileSchema,
  status: z.enum(["ok", "failed"]),
  error: z.string().nullable(),
  score: z.number(),
  violations: z.array(SolverViolationSchema),
  reportStale: z.boolean(),
});

export const RunSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "done", "failed"]),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  solutions: z.array(SolutionSummarySchema),
});

export const RunsResponseSchema = z.object({ runs: z.array(RunSchema) });
export const RunResponseSchema = z.object({ run: RunSchema });
export const StartRunResponseSchema = z.object({ runId: z.string().uuid() });

export const SolutionGridResponseSchema = z.object({
  solution: SolutionSummarySchema,
  week: WeekSchema,
  lessons: z.array(
    z.object({
      blockId: z.string().uuid(),
      subjectId: z.string().uuid().nullable(),
      classIds: z.array(z.string().uuid()),
      teacherIds: z.array(z.string().uuid()),
      day: z.number().int(),
      period: z.number().int(),
      pinned: z.boolean(),
    }),
  ),
  unplaced: z.array(
    z.object({
      blockId: z.string().uuid(),
      subjectId: z.string().uuid().nullable(),
      classIds: z.array(z.string().uuid()),
      teacherIds: z.array(z.string().uuid()),
      missing: z.number().int().min(1),
    }),
  ),
  published: z.boolean(),
  names: z.object({
    classes: z.record(z.string(), z.object({ grade: z.number().int(), number: z.number().int() })),
    teachers: z.record(z.string(), z.string()),
    subjects: z.record(z.string(), z.string()),
  }),
});
