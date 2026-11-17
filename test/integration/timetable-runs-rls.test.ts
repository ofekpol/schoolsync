import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";
import { DEFAULT_WEEK } from "@/lib/timetable/week";

/** RLS and cascades for runs, solutions and placements (migration 0026). */
describe.skipIf(skipIfNoTestDb)("timetable runs RLS", () => {
  const ids = { year: randomUUID(), board: randomUUID(), run: randomUUID(), solution: randomUUID() };

  async function countAll(schoolId: string): Promise<number[]> {
    return withSchool(schoolId, async (tx) => [
      (await tx.select().from(ttRuns).where(eq(ttRuns.id, ids.run))).length,
      (await tx.select().from(ttSolutions).where(eq(ttSolutions.id, ids.solution))).length,
      (await tx.select().from(ttPlacements).where(eq(ttPlacements.solutionId, ids.solution))).length,
    ]);
  }

  beforeAll(async () => {
    if (shouldSkip()) return;
    const db = testDb!;
    const schoolId = testSchoolA;
    await db.insert(schema.academicYears).values({
      id: ids.year,
      schoolId,
      label: `tt-runs-${ids.year}`,
      startDate: "2026-09-01",
      endDate: "2027-06-30",
    });
    await db.insert(ttBoards).values({ id: ids.board, schoolId, academicYearId: ids.year, name: "runs", week: DEFAULT_WEEK });
    await db.insert(ttRuns).values({ id: ids.run, schoolId, boardId: ids.board, input: {} });
    await db.insert(ttSolutions).values({ id: ids.solution, schoolId, runId: ids.run, boardId: ids.board, profile: "balanced", status: "ok" });
    await db.insert(ttPlacements).values({ schoolId, solutionId: ids.solution, blockId: randomUUID(), day: 0, period: 1 });
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await testDb!.delete(schema.academicYears).where(eq(schema.academicYears.id, ids.year));
  });

  it("ownSchoolReadsRuns", async () => {
    expect(await countAll(testSchoolA)).toEqual([1, 1, 1]);
  });

  it("otherSchoolSeesNoRuns", async () => {
    expect(await countAll(testSchoolB)).toEqual([0, 0, 0]);
  });

  it("cannotWriteRunForOtherSchool", async () => {
    await expect(
      withSchool(testSchoolA, (tx) => tx.insert(ttRuns).values({ schoolId: testSchoolB, boardId: ids.board, input: {} })),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });

  it("deletingSolutionClearsPublished", async () => {
    // A throwaway solution, so the board-delete test keeps its own rows.
    const spare = randomUUID();
    await testDb!.insert(ttSolutions).values({ id: spare, schoolId: testSchoolA, runId: ids.run, boardId: ids.board, profile: "teachers", status: "ok" });
    await withSchool(testSchoolA, (tx) =>
      tx.update(ttBoards).set({ publishedSolutionId: spare }).where(eq(ttBoards.id, ids.board)),
    );
    await withSchool(testSchoolA, (tx) => tx.delete(ttSolutions).where(eq(ttSolutions.id, spare)));
    const [board] = await withSchool(testSchoolA, (tx) => tx.select().from(ttBoards).where(eq(ttBoards.id, ids.board)));
    expect(board.publishedSolutionId).toBeNull();
  });

  it("deletingBoardRemovesRuns", async () => {
    await withSchool(testSchoolA, (tx) => tx.delete(ttBoards).where(eq(ttBoards.id, ids.board)));
    expect(await countAll(testSchoolA)).toEqual([0, 0, 0]);
  });
});
