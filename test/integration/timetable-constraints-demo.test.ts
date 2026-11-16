import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBoard, deleteBoard } from "@/lib/timetable/boards";
import { addTeachers } from "@/lib/timetable/teachers";
import { listConstraints } from "@/lib/timetable/constraints/crud";
import { listResponses } from "@/lib/timetable/constraints/collect";
import { writeDemoConstraints } from "@/lib/timetable/constraints/demo";
import { shouldSkip, skipIfNoTestDb, testSchoolA } from "./setup";
import { boardName, ensureActiveYear } from "./timetable-helpers";

describe.skipIf(skipIfNoTestDb)("demo constraints writer", () => {
  let board = "";

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    board = (await createBoard(testSchoolA, boardName("c-demo"))).id;
    await addTeachers(testSchoolA, board, Array.from({ length: 10 }, (_, i) => `מורה ${i + 1}`));
  });

  afterAll(async () => {
    if (!shouldSkip()) await deleteBoard(testSchoolA, board);
  });

  it("writes every generated constraint and marks free days as answered", async () => {
    const { written } = await writeDemoConstraints(testSchoolA, board, 1);
    const stored = await listConstraints(testSchoolA, board);
    expect(stored).toHaveLength(written);
    expect(stored.filter((c) => c.type === "teacher_free_day")).toHaveLength(10);
    expect((await listResponses(testSchoolA, board)).every((r) => r.answeredAt !== null)).toBe(true);
  });
});
