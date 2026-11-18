import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import { TimetableError, type Tx } from "./errors";
import { buildSolverInput } from "./export";
import { slotInWeek } from "./grid";
import { callSolver, SolverCallError } from "./solver-client";
import type { SolverInput, SolverOutput, SolverPlacement, SolverViolation, WeightProfile } from "./solver-contract";

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
  reportStale: boolean;
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

type FullRunRow = typeof ttRuns.$inferSelect;
// The big `input` jsonb is left out: only executeRun reads it.
type RunRow = Pick<FullRunRow, "id" | "status" | "error" | "createdAt" | "finishedAt">;
type SolutionRow = typeof ttSolutions.$inferSelect;

/** A queued/running row older than RUN_STALE_MINUTES reads as failed (the worker died or timed out). */
function effectiveState(row: Pick<RunRow, "status" | "error" | "createdAt">, now: Date): { status: RunStatus; error: string | null } {
  const active = row.status === "queued" || row.status === "running";
  if (active && now.getTime() - row.createdAt.getTime() > RUN_STALE_MINUTES * MINUTE_MS) {
    return { status: "failed", error: "timed_out" };
  }
  return { status: row.status, error: row.error };
}

export function toSolutionSummary(s: SolutionRow): SolutionSummary {
  return {
    id: s.id,
    profile: s.profile,
    status: s.status,
    error: s.error,
    score: s.score,
    violations: s.violations as SolverViolation[],
    reportStale: s.reportStale,
  };
}

function toRun(row: RunRow, solutions: SolutionRow[], now: Date): Run {
  return {
    id: row.id,
    ...effectiveState(row, now),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    solutions: solutions
      .filter((s) => s.runId === row.id)
      .map(toSolutionSummary),
  };
}

type RunInput = Omit<SolverInput, "profile">;

/** The source solution's pins still valid for `input`: known block, slot in the week, at most weeklyPeriods per block. Null when the solution is not this board's. */
async function pinsFor(tx: Tx, boardId: string, solutionId: string, input: RunInput): Promise<SolverPlacement[] | null> {
  const [solution] = await tx
    .select({ id: ttSolutions.id })
    .from(ttSolutions)
    .where(and(eq(ttSolutions.id, solutionId), eq(ttSolutions.boardId, boardId)));
  if (!solution) return null;
  const rows = await tx
    .select({ blockId: ttPlacements.blockId, day: ttPlacements.day, period: ttPlacements.period })
    .from(ttPlacements)
    .where(and(eq(ttPlacements.solutionId, solutionId), eq(ttPlacements.pinned, true)))
    .orderBy(ttPlacements.day, ttPlacements.period);
  const left = new Map(input.blocks.map((block) => [block.id, block.weeklyPeriods]));
  return rows.flatMap((row) => {
    const room = left.get(row.blockId) ?? 0;
    if (room === 0 || !slotInWeek(input.week, row)) return [];
    left.set(row.blockId, room - 1);
    return [{ ...row, pinned: true }];
  });
}

/** Run ids to delete so the board keeps MAX_RUNS_PER_BOARD with the new one; never the run holding the published solution. */
function prunable(runs: Array<{ id: string }>, publishedRunId: string | null): string[] {
  const keep = publishedRunId && runs.some((r) => r.id === publishedRunId) ? MAX_RUNS_PER_BOARD - 2 : MAX_RUNS_PER_BOARD - 1;
  return runs.filter((r) => r.id !== publishedRunId).slice(keep).map((r) => r.id);
}

/** Stores a queued run for the board; the caller then runs executeRun. `fromSolutionId` regenerates around that solution's pins. */
export async function startRun(
  schoolId: string,
  boardId: string,
  staffId: string,
  now: Date = new Date(),
  fromSolutionId?: string,
): Promise<{ runId: string }> {
  const built = await buildSolverInput(schoolId, boardId);
  if (!built) throw new TimetableError("unknown_id");
  if (built.problems.length > 0) throw new TimetableError("input_problems", built.problems);
  const base = Object.fromEntries(Object.entries(built.input).filter(([key]) => key !== "profile")) as RunInput;

  return withSchool(schoolId, async (tx) => {
    // Serialises concurrent starts on this board.
    const [board] = await tx
      .select({ publishedRunId: ttSolutions.runId })
      .from(ttBoards)
      .leftJoin(ttSolutions, eq(ttSolutions.id, ttBoards.publishedSolutionId))
      .where(eq(ttBoards.id, boardId))
      .for("update", { of: ttBoards });
    const pins = fromSolutionId ? await pinsFor(tx, boardId, fromSolutionId, base) : [];
    if (!pins) throw new TimetableError("unknown_id");
    const runs = await tx
      .select({ id: ttRuns.id, status: ttRuns.status, createdAt: ttRuns.createdAt })
      .from(ttRuns)
      .where(eq(ttRuns.boardId, boardId))
      .orderBy(desc(ttRuns.createdAt));
    if (runs.some((r) => ["queued", "running"].includes(effectiveState({ ...r, error: null }, now).status))) {
      throw new TimetableError("run_in_progress");
    }
    const excess = prunable(runs, board?.publishedRunId ?? null);
    if (excess.length > 0) await tx.delete(ttRuns).where(inArray(ttRuns.id, excess));
    const [row] = await tx
      .insert(ttRuns)
      .values({ schoolId, boardId, input: { ...base, placements: pins }, requestedBy: staffId, createdAt: now })
      .returning({ id: ttRuns.id });
    return { runId: row.id };
  });
}

const slotKey = (p: Pick<SolverPlacement, "blockId" | "day" | "period">) => `${p.blockId}:${p.day}:${p.period}`;

/** Output keys that keep a pin, plus the pin_moved violation when the solver moved some pins. */
function pinOutcome(pins: SolverPlacement[], output: SolverOutput): { kept: Set<string>; violations: SolverViolation[] } {
  const placed = new Set(output.placements.map(slotKey));
  const kept = new Set(pins.map(slotKey).filter((key) => placed.has(key)));
  const moved = pins.length - kept.size;
  const violations = moved > 0 ? [{ constraintId: null, type: "pin_moved", hard: true, count: moved, teacherIds: [], classIds: [] }] : [];
  return { kept, violations };
}

function errorCode(reason: unknown): string {
  return reason instanceof SolverCallError ? reason.code : "internal_error";
}

async function saveSolution(
  schoolId: string,
  run: FullRunRow,
  profile: WeightProfile,
  result: PromiseSettledResult<SolverOutput>,
): Promise<boolean> {
  const output = result.status === "fulfilled" ? result.value : null;
  const ok = output?.status === "ok";
  if (!ok) console.error("[timetable-run] profile failed", run.id, profile, result.status === "rejected" ? result.reason : output?.error);
  const error = ok ? null : output ? "solver_failed" : errorCode((result as PromiseRejectedResult).reason);
  const pins = (run.input as Partial<RunInput>).placements ?? [];
  const { kept, violations } = ok ? pinOutcome(pins, output) : { kept: new Set<string>(), violations: [] };
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
        violations: ok ? [...output.violations, ...violations] : [],
      })
      .returning({ id: ttSolutions.id });
    if (!ok || output.placements.length === 0) return;
    await tx
      .insert(ttPlacements)
      .values(output.placements.map((p) => ({ schoolId, solutionId: solution.id, blockId: p.blockId, day: p.day, period: p.period, pinned: kept.has(slotKey(p)) })));
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
    const input = run.input as RunInput;
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
    const rows = await tx
      .select({ id: ttRuns.id, status: ttRuns.status, error: ttRuns.error, createdAt: ttRuns.createdAt, finishedAt: ttRuns.finishedAt })
      .from(ttRuns)
      .where(where).orderBy(desc(ttRuns.createdAt));
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
