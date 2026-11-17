import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import { TimetableError } from "./errors";
import { buildSolverInput } from "./export";
import { callSolver, SolverCallError } from "./solver-client";
import type { SolverInput, SolverOutput, SolverViolation, WeightProfile } from "./solver-contract";

export const RUN_PROFILES: readonly WeightProfile[] = ["teachers", "classes", "balanced"];
export const RUN_STALE_MINUTES = 6;
export const MAX_RUNS_PER_BOARD = 20;
const MINUTE_MS = 60_000;

export type RunStatus = "queued" | "running" | "done" | "failed";
export interface SolutionSummary {
  id: string;
  profile: WeightProfile;
  status: "ok" | "failed";
  error: string | null;
  score: number;
  violations: SolverViolation[];
}
export interface Run {
  id: string;
  status: RunStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  solutions: SolutionSummary[];
}
export type SolveFn = (input: SolverInput) => Promise<SolverOutput>;

type RunRow = typeof ttRuns.$inferSelect;
type SolutionRow = typeof ttSolutions.$inferSelect;

/** A queued/running row older than RUN_STALE_MINUTES reads as failed (the worker died or timed out). */
function effectiveState(row: RunRow, now: Date): { status: RunStatus; error: string | null } {
  const active = row.status === "queued" || row.status === "running";
  if (active && now.getTime() - row.createdAt.getTime() > RUN_STALE_MINUTES * MINUTE_MS) {
    return { status: "failed", error: "timed_out" };
  }
  return { status: row.status, error: row.error };
}

function toRun(row: RunRow, solutions: SolutionRow[], now: Date): Run {
  return {
    id: row.id,
    ...effectiveState(row, now),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    solutions: solutions
      .filter((s) => s.runId === row.id)
      .map((s) => ({
        id: s.id,
        profile: s.profile,
        status: s.status,
        error: s.error,
        score: s.score,
        violations: s.violations as SolverViolation[],
      })),
  };
}

/** Stores a queued run for the board; the caller then runs executeRun. */
export async function startRun(schoolId: string, boardId: string, staffId: string, now: Date = new Date()): Promise<{ runId: string }> {
  const built = await buildSolverInput(schoolId, boardId);
  if (!built) throw new TimetableError("unknown_id");
  if (built.problems.length > 0) throw new TimetableError("input_problems", built.problems);
  const input = Object.fromEntries(Object.entries(built.input).filter(([key]) => key !== "profile"));

  return withSchool(schoolId, async (tx) => {
    // Serialises concurrent starts on this board.
    await tx.select({ id: ttBoards.id }).from(ttBoards).where(eq(ttBoards.id, boardId)).for("update");
    const runs = await tx.select().from(ttRuns).where(eq(ttRuns.boardId, boardId)).orderBy(desc(ttRuns.createdAt));
    if (runs.some((r) => ["queued", "running"].includes(effectiveState(r, now).status))) {
      throw new TimetableError("run_in_progress");
    }
    const excess = runs.slice(MAX_RUNS_PER_BOARD - 1).map((r) => r.id);
    if (excess.length > 0) await tx.delete(ttRuns).where(inArray(ttRuns.id, excess));
    const [row] = await tx
      .insert(ttRuns)
      .values({ schoolId, boardId, input, requestedBy: staffId, createdAt: now })
      .returning({ id: ttRuns.id });
    return { runId: row.id };
  });
}

function errorCode(reason: unknown): string {
  return reason instanceof SolverCallError ? reason.code : "internal_error";
}

async function saveSolution(
  schoolId: string,
  run: RunRow,
  profile: WeightProfile,
  result: PromiseSettledResult<SolverOutput>,
): Promise<boolean> {
  const output = result.status === "fulfilled" ? result.value : null;
  const ok = output?.status === "ok";
  if (!ok) console.error("[timetable-run] profile failed", run.id, profile, result.status === "rejected" ? result.reason : output?.error);
  const error = ok ? null : output ? "solver_failed" : errorCode((result as PromiseRejectedResult).reason);
  await withSchool(schoolId, async (tx) => {
    const [solution] = await tx
      .insert(ttSolutions)
      .values({
        schoolId,
        runId: run.id,
        boardId: run.boardId,
        profile,
        status: ok ? "ok" : "failed",
        error,
        score: ok ? output.score : 0,
        violations: ok ? output.violations : [],
      })
      .returning({ id: ttSolutions.id });
    if (!ok || output.placements.length === 0) return;
    await tx
      .insert(ttPlacements)
      .values(output.placements.map((p) => ({ schoolId, solutionId: solution.id, blockId: p.blockId, day: p.day, period: p.period, pinned: false })));
  });
  return ok;
}

async function setRun(schoolId: string, runId: string, values: Partial<typeof ttRuns.$inferInsert>): Promise<void> {
  await withSchool(schoolId, (tx) => tx.update(ttRuns).set(values).where(eq(ttRuns.id, runId)));
}

/** Solves every profile and stores the results. Never throws. */
export async function executeRun(schoolId: string, runId: string, solve: SolveFn = callSolver): Promise<void> {
  try {
    const [run] = await withSchool(schoolId, (tx) => tx.select().from(ttRuns).where(eq(ttRuns.id, runId)));
    if (!run) return;
    await setRun(schoolId, runId, { status: "running", startedAt: new Date() });
    const input = run.input as Omit<SolverInput, "profile">;
    const results = await Promise.allSettled(RUN_PROFILES.map((profile) => solve({ ...input, profile } as SolverInput)));
    const saved = await Promise.all(results.map((result, i) => saveSolution(schoolId, run, RUN_PROFILES[i], result)));
    const anyOk = saved.some(Boolean);
    await setRun(schoolId, runId, { status: anyOk ? "done" : "failed", error: anyOk ? null : "all_profiles_failed", finishedAt: new Date() });
  } catch (error) {
    console.error("[timetable-run] execute failed", runId, error);
    await setRun(schoolId, runId, { status: "failed", error: "internal_error", finishedAt: new Date() }).catch((e: unknown) =>
      console.error("[timetable-run] could not mark run failed", runId, e),
    );
  }
}

async function loadRuns(schoolId: string, boardId: string, runId: string | null, now: Date): Promise<Run[]> {
  return withSchool(schoolId, async (tx) => {
    const where = runId ? and(eq(ttRuns.boardId, boardId), eq(ttRuns.id, runId)) : eq(ttRuns.boardId, boardId);
    const rows = await tx.select().from(ttRuns).where(where).orderBy(desc(ttRuns.createdAt));
    if (rows.length === 0) return [];
    const solutions = await tx.select().from(ttSolutions).where(inArray(ttSolutions.runId, rows.map((r) => r.id)));
    return rows.map((row) => toRun(row, solutions, now));
  });
}

export async function getRun(schoolId: string, boardId: string, runId: string, now: Date = new Date()): Promise<Run | null> {
  return (await loadRuns(schoolId, boardId, runId, now))[0] ?? null;
}

/** Newest first. */
export function listRuns(schoolId: string, boardId: string, now: Date = new Date()): Promise<Run[]> {
  return loadRuns(schoolId, boardId, null, now);
}
