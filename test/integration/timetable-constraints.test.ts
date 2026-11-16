import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBoard, deleteBoard } from "@/lib/timetable/boards";
import { addTeachers, updateTeacher } from "@/lib/timetable/teachers";
import { archiveCategory, createCategory } from "@/lib/profile/categories";
import {
  createConstraint,
  deleteConstraint,
  listConstraints,
  replaceConstraint,
} from "@/lib/timetable/constraints/crud";
import { ConstraintError } from "@/lib/timetable/constraints/errors";
import type { ConstraintInput } from "@/lib/timetable/constraints/registry";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";
import { boardName, ensureActiveYear } from "./timetable-helpers";

const MANAGEMENT = { staffUserId: null, source: "management" as const };

describe.skipIf(skipIfNoTestDb)("timetable constraints domain", () => {
  const ids = { board: "", otherBoard: "", boardB: "", t1: "", t2: "", tOther: "", optionA: "", optionB: "", catA: "", catB: "" };

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    await ensureActiveYear(testSchoolB);
    ids.board = (await createBoard(testSchoolA, boardName("c-crud"))).id;
    ids.otherBoard = (await createBoard(testSchoolA, boardName("c-crud"))).id;
    ids.boardB = (await createBoard(testSchoolB, boardName("c-crud"))).id;
    [ids.t1, ids.t2] = (await addTeachers(testSchoolA, ids.board, ["א", "ב"])).map((t) => t.id);
    ids.tOther = (await addTeachers(testSchoolA, ids.otherBoard, ["ג"]))[0].id;
    await updateTeacher(testSchoolA, ids.t2, { freeDayEntitled: false });
    const catA = await createCategory(testSchoolA, { name: `c-crud ${ids.board}`, multiSelect: true, required: false, options: [{ label: "מתמטיקה" }] });
    const catB = await createCategory(testSchoolB, { name: `c-crud ${ids.boardB}`, multiSelect: true, required: false, options: [{ label: "מתמטיקה" }] });
    [ids.catA, ids.optionA, ids.catB, ids.optionB] = [catA.id, catA.options[0].id, catB.id, catB.options[0].id];
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    for (const board of [ids.board, ids.otherBoard]) await deleteBoard(testSchoolA, board);
    await deleteBoard(testSchoolB, ids.boardB);
    await archiveCategory(testSchoolA, ids.catA);
    await archiveCategory(testSchoolB, ids.catB);
  });

  const meeting = (target: unknown): ConstraintInput =>
    ({ type: "meeting", hard: true, weight: 100, params: { target, weeklyPeriods: 2, consecutive: true } }) as ConstraintInput;
  const freeDay = (teacherId: string, day = 5): ConstraintInput =>
    ({ type: "teacher_free_day", hard: true, weight: 100, teacherId, params: { day } }) as ConstraintInput;

  it("creates and lists each kind of constraint", async () => {
    const created = await Promise.all([
      createConstraint(testSchoolA, ids.board, meeting({ kind: "label", optionId: ids.optionA }), MANAGEMENT),
      createConstraint(testSchoolA, ids.board, freeDay(ids.t1), { staffUserId: null, source: "teacher" }),
      createConstraint(testSchoolA, ids.board, { type: "class_no_gaps", hard: false, weight: 30, params: {} }, MANAGEMENT),
    ]);
    const list = await listConstraints(testSchoolA, ids.board);
    expect(list.map((c) => c.id).sort()).toEqual(created.map((c) => c.id).sort());
    const free = list.find((c) => c.type === "teacher_free_day")!;
    expect(free).toMatchObject({ teacherId: ids.t1, source: "teacher", hard: true, params: { day: 5 } });
    expect(list.find((c) => c.type === "class_no_gaps")).toMatchObject({ hard: false, weight: 30 });
  });

  it("refuses a teacher of another board and an option of another school", async () => {
    const before = (await listConstraints(testSchoolA, ids.board)).length;
    await expect(
      createConstraint(testSchoolA, ids.board, meeting({ kind: "teachers", teacherIds: [ids.tOther] }), MANAGEMENT),
    ).rejects.toMatchObject({ code: "unknown_id" });
    await expect(
      createConstraint(testSchoolA, ids.board, meeting({ kind: "label", optionId: ids.optionB }), MANAGEMENT),
    ).rejects.toMatchObject({ code: "unknown_id" });
    expect(await listConstraints(testSchoolA, ids.board)).toHaveLength(before);
  });

  it("refuses a free day for a teacher who is not entitled", async () => {
    await expect(createConstraint(testSchoolA, ids.board, freeDay(ids.t2), MANAGEMENT)).rejects.toMatchObject({
      code: "not_entitled",
    });
  });

  it("answers duplicate_free_day, not a database error, when two free days race", async () => {
    const [teacher] = await addTeachers(testSchoolA, ids.board, ["race"]);
    const results = await Promise.allSettled([
      createConstraint(testSchoolA, ids.board, freeDay(teacher.id, 0), MANAGEMENT),
      createConstraint(testSchoolA, ids.board, freeDay(teacher.id, 5), MANAGEMENT),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConstraintError);
    expect(rejected.reason).toMatchObject({ code: "duplicate_free_day" });
  });

  it("replaces params, refuses a type change, and deletes", async () => {
    const created = await createConstraint(testSchoolA, ids.board, { type: "subject_max_per_day", hard: true, weight: 50, params: { max: 2 } }, MANAGEMENT);
    const replaced = await replaceConstraint(testSchoolA, ids.board, created.id, { type: "subject_max_per_day", hard: false, weight: 20, params: { max: 3 } });
    expect(replaced).toMatchObject({ hard: false, weight: 20, params: { max: 3 } });
    await expect(
      replaceConstraint(testSchoolA, ids.board, created.id, { type: "class_no_gaps", hard: true, weight: 50, params: {} }),
    ).rejects.toMatchObject({ code: "type_changed" });
    expect(await deleteConstraint(testSchoolA, ids.board, created.id)).toBe(true);
    expect(await deleteConstraint(testSchoolA, ids.board, created.id)).toBe(false);
  });

  it("treats a constraint of another board as not found", async () => {
    const created = await createConstraint(testSchoolA, ids.board, { type: "teacher_few_gaps", hard: false, weight: 10, params: {} }, MANAGEMENT);
    expect(await replaceConstraint(testSchoolA, ids.otherBoard, created.id, { type: "teacher_few_gaps", hard: false, weight: 5, params: {} })).toBeNull();
    expect(await deleteConstraint(testSchoolA, ids.otherBoard, created.id)).toBe(false);
  });

  it("keeps schools apart", async () => {
    expect(await listConstraints(testSchoolB, ids.board)).toEqual([]);
    await expect(
      createConstraint(testSchoolB, ids.board, { type: "class_no_gaps", hard: true, weight: 50, params: {} }, MANAGEMENT),
    ).rejects.toMatchObject({ code: "unknown_id" });
  });
});
