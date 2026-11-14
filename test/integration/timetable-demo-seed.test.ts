import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSeedTargetAllowed } from "@/db/seed";
import { createBoard, deleteBoard, listBoards, type Board } from "@/lib/timetable/boards";
import { setGradeClassCount, listClasses } from "@/lib/timetable/classes";
import { DEMO_BOARD_NAME } from "@/lib/timetable/demo/curriculum";
import { generateDemoPlan } from "@/lib/timetable/demo/generate";
import { loadDemoStaff, writeDemoBoard } from "@/lib/timetable/demo/write";
import { buildSolverInput } from "@/lib/timetable/export";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testSchoolA } from "./setup";

describe.skipIf(skipIfNoTestDb)("timetable demo seed", () => {
  let other: Board;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    other = await createBoard(testSchoolA, boardName("אחר"));
    await setGradeClassCount(testSchoolA, other.id, 7, 2);
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, other.id);
    const demo = (await listBoards(testSchoolA)).find((b) => b.name === DEMO_BOARD_NAME);
    if (demo) await deleteBoard(testSchoolA, demo.id);
  });

  it("writes exactly one demo board, leaves other boards alone and exports with no problems", async () => {
    const staff = await loadDemoStaff(testSchoolA, "no-such-category");
    expect(staff.every((s) => s.subjects.length === 0)).toBe(true);
    const plan = generateDemoPlan({ staff, classCounts: { 7: 3, 8: 2 }, seed: 1, anonymize: true });
    await writeDemoBoard(testSchoolA, plan);
    const { boardId } = await writeDemoBoard(testSchoolA, plan);

    const boards = await listBoards(testSchoolA);
    expect(boards.filter((b) => b.name === DEMO_BOARD_NAME).map((b) => b.id)).toEqual([boardId]);
    expect(boards.map((b) => b.id)).toContain(other.id);
    expect(await listClasses(testSchoolA, other.id)).toHaveLength(2);

    const exported = await buildSolverInput(testSchoolA, boardId);
    expect(exported?.problems).toEqual([]);
    expect(exported?.input.blocks).toHaveLength(plan.blocks.length);
  });

  it("refuses to seed a production database", () => {
    expect(() => assertSeedTargetAllowed("postgres://x@db.prod.example/postgres")).toThrow();
  });
});
