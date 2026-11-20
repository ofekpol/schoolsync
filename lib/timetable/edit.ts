import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import type { PlacementEdit } from "@/lib/validations/timetable-runs";
import { TimetableError, mapPgError, type Tx } from "./errors";
import { callSolver, SolverCallError, type SolverCallErrorCode } from "./solver-client";
import { toSolutionSummary, type SolveFn, type SolutionSummary } from "./runs";
import { slotInWeek, type Slot } from "./grid";
import type { SolverInput, WeightProfile } from "./solver-contract";

type StoredInput = Pick<SolverInput, "week" | "blocks">;

export interface SolutionRef {
  boardId: string;
  runId: string;
  solutionId: string;
}

/** The solution (id, run and board must all match) with its status and its run's stored input; null when none. `lock` row-locks the solution until the transaction ends. */
export async function findSolution(tx: Tx, ref: SolutionRef, lock = false): Promise<{ status: string; profile: WeightProfile; input: StoredInput } | null> {
  const query = tx
    .select({ status: ttSolutions.status, profile: ttSolutions.profile, input: ttRuns.input })
    .from(ttSolutions)
    .innerJoin(ttRuns, eq(ttRuns.id, ttSolutions.runId))
    .where(and(eq(ttSolutions.id, ref.solutionId), eq(ttSolutions.runId, ref.runId), eq(ttSolutions.boardId, ref.boardId)));
  const [row] = await (lock ? query.for("update", { of: ttSolutions }) : query);
  return row ? { status: row.status, profile: row.profile, input: row.input as StoredInput } : null;
}

const keyOf = (solutionId: string, blockId: string, slot: Slot) =>
  and(
    eq(ttPlacements.solutionId, solutionId),
    eq(ttPlacements.blockId, blockId),
    eq(ttPlacements.day, slot.day),
    eq(ttPlacements.period, slot.period),
  );

async function markStale(tx: Tx, solutionId: string): Promise<void> {
  await tx.update(ttSolutions).set({ reportStale: true }).where(eq(ttSolutions.id, solutionId));
}

async function placeFromTray(tx: Tx, schoolId: string, solutionId: string, blockId: string, weeklyPeriods: number, to: Slot): Promise<void> {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(ttPlacements)
    .where(and(eq(ttPlacements.solutionId, solutionId), eq(ttPlacements.blockId, blockId)));
  if (count >= weeklyPeriods) throw new TimetableError("fully_placed");
  await tx
    .insert(ttPlacements)
    .values({ schoolId, solutionId, blockId, day: to.day, period: to.period, pinned: true })
    .catch((error: unknown) => mapPgError(error, { unique: "slot_taken" }));
}

async function moveRow(tx: Tx, solutionId: string, blockId: string, from: Slot, to: Slot): Promise<boolean> {
  const updated = await tx
    .update(ttPlacements)
    .set({ day: to.day, period: to.period, pinned: true })
    .where(keyOf(solutionId, blockId, from))
    .returning({ blockId: ttPlacements.blockId })
    .catch((error: unknown) => mapPgError(error, { unique: "slot_taken" }));
  return updated.length > 0;
}

/** Throws TimetableError; returns false when the solution or the source row is not found (route → 404). */
export function editPlacement(schoolId: string, ref: SolutionRef, edit: PlacementEdit): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const solution = await findSolution(tx, ref, true);
    if (!solution) return false;
    if (solution.status !== "ok") throw new TimetableError("solution_failed");
    const block = solution.input.blocks.find((b) => b.id === edit.blockId);
    if (!block) throw new TimetableError("unknown_id");
    const { solutionId } = ref;

    if (edit.action === "pin") {
      const updated = await tx
        .update(ttPlacements)
        .set({ pinned: edit.pinned })
        .where(keyOf(solutionId, edit.blockId, edit))
        .returning({ blockId: ttPlacements.blockId });
      return updated.length > 0;
    }

    if (edit.to && !slotInWeek(solution.input.week, edit.to)) throw new TimetableError("not_in_week");
    let found = true;
    if (edit.from && edit.to) found = await moveRow(tx, solutionId, edit.blockId, edit.from, edit.to);
    else if (edit.from) {
      const deleted = await tx.delete(ttPlacements).where(keyOf(solutionId, edit.blockId, edit.from)).returning({ blockId: ttPlacements.blockId });
      found = deleted.length > 0;
    } else if (edit.to) await placeFromTray(tx, schoolId, solutionId, edit.blockId, block.weeklyPeriods, edit.to);
    if (found) await markStale(tx, solutionId);
    return found;
  });
}

/** Makes the solution the board's timetable. False = not found; throws solution_failed. */
export function publishSolution(schoolId: string, ref: SolutionRef): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const solution = await findSolution(tx, ref, true);
    if (!solution) return false;
    if (solution.status !== "ok") throw new TimetableError("solution_failed");
    await tx.update(ttBoards).set({ publishedSolutionId: ref.solutionId, status: "published" }).where(eq(ttBoards.id, ref.boardId));
    return true;
  });
}

export type EvaluateResult =
  | { ok: true; solution: SolutionSummary }
  | { ok: false; error: SolverCallErrorCode | "evaluate_unsupported" | "solver_failed" | "placements_changed" };

const placementKeys = (rows: { blockId: string; day: number; period: number }[]) =>
  rows.map((r) => `${r.blockId}:${r.day}:${r.period}`).sort();

const loadPlacements = (tx: Tx, solutionId: string) =>
  tx
    .select({ blockId: ttPlacements.blockId, day: ttPlacements.day, period: ttPlacements.period, pinned: ttPlacements.pinned })
    .from(ttPlacements)
    .where(eq(ttPlacements.solutionId, solutionId));

/** Asks the solver for the constraint report of the current placements (outside any transaction) and stores it. null = not found. Never stores a report for placements other than the ones sent. */
export async function evaluateSolution(schoolId: string, ref: SolutionRef, solve: SolveFn = callSolver): Promise<EvaluateResult | null> {
  const read = await withSchool(schoolId, async (tx) => {
    const solution = await findSolution(tx, ref);
    if (!solution) return null;
    if (solution.status !== "ok") throw new TimetableError("solution_failed");
    return { solution, placements: await loadPlacements(tx, ref.solutionId) };
  });
  if (!read) return null;

  const input = { ...read.solution.input, mode: "evaluate", profile: read.solution.profile, placements: read.placements } as SolverInput;
  let output;
  try {
    output = await solve(input);
  } catch (error) {
    console.error("[timetable-evaluate] solver call failed", ref.solutionId, error);
    return { ok: false, error: error instanceof SolverCallError ? error.code : "solver_failed" };
  }
  if (output.status !== "ok") {
    console.error("[timetable-evaluate] solver reported failure", ref.solutionId, output.error);
    return { ok: false, error: "solver_failed" };
  }
  if (placementKeys(output.placements).join("|") !== placementKeys(read.placements).join("|")) {
    console.error("[timetable-evaluate] solver changed the placements (evaluate unsupported)", ref.solutionId);
    return { ok: false, error: "evaluate_unsupported" };
  }

  return withSchool(schoolId, async (tx) => {
    // Locks the solution: an edit can no longer slip in between the comparison and the write.
    if (!(await findSolution(tx, ref, true))) return null;
    if (placementKeys(await loadPlacements(tx, ref.solutionId)).join("|") !== placementKeys(read.placements).join("|")) {
      return { ok: false as const, error: "placements_changed" as const };
    }
    const [row] = await tx
      .update(ttSolutions)
      .set({ score: output.score, violations: output.violations, reportStale: false })
      .where(eq(ttSolutions.id, ref.solutionId))
      .returning();
    return { ok: true as const, solution: toSolutionSummary(row) };
  });
}
