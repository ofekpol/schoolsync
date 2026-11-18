import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import type { PlacementEdit } from "@/lib/validations/timetable-runs";
import { TimetableError, mapPgError, type Tx } from "./errors";
import { slotInWeek, type Slot } from "./grid";
import type { SolverInput } from "./solver-contract";

type StoredInput = Pick<SolverInput, "week" | "blocks">;

export interface SolutionRef {
  boardId: string;
  runId: string;
  solutionId: string;
}

/** The solution (id, run and board must all match) with its status and its run's stored input; null when none. */
export async function findSolution(tx: Tx, ref: SolutionRef): Promise<{ status: string; input: StoredInput } | null> {
  const [row] = await tx
    .select({ status: ttSolutions.status, input: ttRuns.input })
    .from(ttSolutions)
    .innerJoin(ttRuns, eq(ttRuns.id, ttSolutions.runId))
    .where(and(eq(ttSolutions.id, ref.solutionId), eq(ttSolutions.runId, ref.runId), eq(ttSolutions.boardId, ref.boardId)));
  return row ? { status: row.status, input: row.input as StoredInput } : null;
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
    const solution = await findSolution(tx, ref);
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
