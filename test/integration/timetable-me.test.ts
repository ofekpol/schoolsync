import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createBoard, deleteBoard } from "@/lib/timetable/boards";
import { addTeachersFromStaff, updateTeacher } from "@/lib/timetable/teachers";
import { listResponses, startCollecting } from "@/lib/timetable/constraints/collect";
import { listConstraints } from "@/lib/timetable/constraints/crud";
import { answerAsTeacher, listMyBoards } from "@/lib/timetable/constraints/me";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";
import { boardName, ensureActiveYear } from "./timetable-helpers";

const S = testSchoolA;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(skipIfNoTestDb)("a teacher's own constraints", () => {
  const me = randomUUID();
  const other = randomUUID();
  const ids = { open: "", setup: "", closed: "", meOnOpen: "" };

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(S);
    await testDb!.insert(schema.staffUsers).values([me, other].map((id) => ({
      id, schoolId: S, email: `me-${id}@test`, fullName: "מורה", role: "editor" as const, status: "active" as const,
    })));
    for (const key of ["open", "setup", "closed"] as const) {
      ids[key] = (await createBoard(S, boardName(`me-${key}`))).id;
      const linked = await addTeachersFromStaff(S, ids[key], [me, other]);
      if (key === "open") ids.meOnOpen = linked.find((t) => t.staffUserId === me)!.id;
    }
    await startCollecting(S, ids.open, new Date(Date.now() + DAY));
    await startCollecting(S, ids.closed, new Date(Date.now() + DAY));
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    for (const board of [ids.open, ids.setup, ids.closed]) await deleteBoard(S, board);
    await testDb!.delete(schema.staffUsers).where(inArray(schema.staffUsers.id, [me, other]));
  });

  it("lists only collecting boards where the staff user is a teacher", async () => {
    const boards = await listMyBoards(S, me);
    expect(boards.map((b) => b.boardId).sort()).toEqual([ids.open, ids.closed].sort());
    expect(boards.find((b) => b.boardId === ids.open)).toMatchObject({
      teacherId: ids.meOnOpen, freeDayEntitled: true, freeDay: null, answeredAt: null, open: true, days: [0, 1, 2, 3, 4, 5],
    });
    expect(await listMyBoards(S, randomUUID())).toEqual([]);
    expect(await listMyBoards(testSchoolB, me)).toEqual([]);
  });

  it("sets and clears the teacher's own free day, answered by the teacher", async () => {
    const set = await answerAsTeacher(S, me, ids.open, 5);
    expect(set).toMatchObject({ freeDay: 5, byManagement: false });
    expect(set.answeredAt).not.toBeNull();
    const row = (await listConstraints(S, ids.open)).find((c) => c.teacherId === ids.meOnOpen);
    expect(row).toMatchObject({ type: "teacher_free_day", source: "teacher", params: { day: 5 } });
    expect((await answerAsTeacher(S, me, ids.open, null)).freeDay).toBeNull();
    const mine = (await listResponses(S, ids.open)).find((r) => r.teacherId === ids.meOnOpen);
    expect(mine).toMatchObject({ byManagement: false, freeDay: null });
  });

  it("refuses after the deadline, before collection, and for a board where they do not teach", async () => {
    const after = new Date(Date.now() + 2 * DAY);
    await expect(answerAsTeacher(S, me, ids.closed, 1, after)).rejects.toMatchObject({ code: "deadline_past" });
    expect((await listMyBoards(S, me, after)).find((b) => b.boardId === ids.closed)?.open).toBe(false);
    await expect(answerAsTeacher(S, me, ids.setup, 1)).rejects.toMatchObject({ code: "wrong_status" });
    await expect(answerAsTeacher(S, randomUUID(), ids.open, 1)).rejects.toMatchObject({ code: "unknown_id" });
  });

  it("refuses a free day when the teacher is not entitled, writing nothing", async () => {
    const otherTeacher = (await listMyBoards(S, other)).find((b) => b.boardId === ids.open)!;
    await updateTeacher(S, otherTeacher.teacherId, { freeDayEntitled: false });
    await expect(answerAsTeacher(S, other, ids.open, 2)).rejects.toMatchObject({ code: "not_entitled" });
    expect((await listMyBoards(S, other)).find((b) => b.boardId === ids.open)?.answeredAt).toBeNull();
    expect((await answerAsTeacher(S, other, ids.open, null)).answeredAt).not.toBeNull();
  });
});
