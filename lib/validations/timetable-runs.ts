import { z } from "zod";
import { SolverViolationSchema, WeightProfileSchema } from "@/lib/timetable/solver-contract";

export const SolutionSummarySchema = z.object({
  id: z.string().uuid(),
  profile: WeightProfileSchema,
  status: z.enum(["ok", "failed"]),
  error: z.string().nullable(),
  score: z.number(),
  violations: z.array(SolverViolationSchema),
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
