import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ttBoards } from "@/lib/db/schema-timetable";
import { createBoard, deleteBoard } from "@/lib/timetable/boards";
import { addTeachers, updateTeacher } from "@/lib/timetable/teachers";
import { listConstraints } from "@/lib/timetable/constraints/crud";
import {
  fillInForTeacher,
  getCollectState,
  listResponses,
  startCollecting,
} from "@/lib/timetable/constraints/collect";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA } from "./setup";
import { boardName, ensureActiveYear } from "./timetable-helpers";

const S = testSchoolA;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(skipIfNoTestDb)("timetable collection round", () => {
  const ids = { board: "", published: "", t1: "", t2: "", t3: "" };

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(S);
    ids.board = (await createBoard(S, boardName("collect"))).id;
    ids.published = (await createBoard(S, boardName("collect"))).id;
    await testDb!.update(ttBoards).set({ status: "published" }).where(eq(ttBoards.id, ids.published));
    [ids.t1, ids.t2, ids.t3] = (await addTeachers(S, ids.board, ["א", "ב", "ג"])).map((t) => t.id);
    await updateTeacher(S, ids.t3, { freeDayEntitled: false });
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(S, ids.board);
    await deleteBoard(S, ids.published);
  });

  it("opens the round with a deadline and moves the deadline later", async () => {
    const first = new Date(Date.now() + DAY);
    expect(await startCollecting(S, ids.board, first)).toEqual({ status: "collecting", teacherDeadline: first.toISOString() });
    const second = new Date(Date.now() + 3 * DAY);
    await startCollecting(S, ids.board, second);
    expect(await getCollectState(S, ids.board)).toEqual({ status: "collecting", teacherDeadline: second.toISOString() });
  });

  it("refuses a deadline in the past and a published board", async () => {
    const before = await getCollectState(S, ids.board);
    await expect(startCollecting(S, ids.board, new Date(Date.now() - 60_000))).rejects.toMatchObject({ code: "deadline_past" });
    expect(await getCollectState(S, ids.board)).toEqual(before);
    await expect(startCollecting(S, ids.published, new Date(Date.now() + DAY))).rejects.toMatchObject({ code: "wrong_status" });
  });

  it("lists every teacher, unanswered ones with no date", async () => {
    const responses = await listResponses(S, ids.board);
    expect(responses.map((r) => r.teacherId).sort()).toEqual([ids.t1, ids.t2, ids.t3].sort());
    expect(responses.every((r) => r.answeredAt === null && r.freeDay === null)).toBe(true);
  });

  it("fills in a free day, then clears it, keeping the teacher answered", async () => {
    const filled = await fillInForTeacher(S, ids.board, ids.t1, 5, null);
    expect(filled).toMatchObject({ teacherId: ids.t1, byManagement: true, freeDay: 5 });
    expect(filled.answeredAt).not.toBeNull();
    const cleared = await fillInForTeacher(S, ids.board, ids.t1, null, null);
    expect(cleared).toMatchObject({ freeDay: null, byManagement: true });
    expect(cleared.answeredAt).not.toBeNull();
    expect((await listConstraints(S, ids.board)).filter((c) => c.type === "teacher_free_day")).toEqual([]);
    const free = await fillInForTeacher(S, ids.board, ids.t2, 0, null);
    expect(free.freeDay).toBe(0);
    expect((await listConstraints(S, ids.board)).find((c) => c.teacherId === ids.t2)).toMatchObject({ source: "teacher" });
  });

  it("refuses a free day for a teacher who is not entitled and records nothing", async () => {
    await expect(fillInForTeacher(S, ids.board, ids.t3, 2, null)).rejects.toMatchObject({ code: "not_entitled" });
    expect((await listResponses(S, ids.board)).find((r) => r.teacherId === ids.t3)?.answeredAt).toBeNull();
  });
});
