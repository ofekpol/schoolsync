import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createBoard, deleteBoard } from "@/lib/timetable/boards";
import { addTeachers, addTeachersFromStaff, deleteTeacher, listTeachers, updateTeacher } from "@/lib/timetable/teachers";
import { archiveCategory, createCategory, listCategories, replaceCategory } from "@/lib/profile/categories";
import { setStaffOptions } from "@/lib/profile/staff-labels";
import { buildSolverInput } from "@/lib/timetable/export";
import { exportConstraints } from "@/lib/timetable/constraints/export";
import { createConstraint } from "@/lib/timetable/constraints/crud";
import type { ConstraintInput } from "@/lib/timetable/constraints/registry";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA } from "./setup";
import { boardName, ensureActiveYear } from "./timetable-helpers";

const MANAGEMENT = { staffUserId: null, source: "management" as const };
const S = testSchoolA;

describe.skipIf(skipIfNoTestDb)("constraints in the solver input", () => {
  const staff = [randomUUID(), randomUUID()];
  const ids = { board: "", linked1: "", linked2: "", placeholder: "", cat: "", math: "", other: "" };

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(S);
    await testDb!.insert(schema.staffUsers).values(
      staff.map((id, i) => ({ id, schoolId: S, email: `c-exp-${id}@test`, fullName: `צוות ${i}`, role: "editor" as const, status: "active" as const })),
    );
    const cat = await createCategory(S, { name: `c-exp ${staff[0]}`, multiSelect: true, required: false, options: [{ label: "מתמטיקה" }, { label: "אנגלית" }] });
    [ids.cat, ids.math, ids.other] = [cat.id, cat.options[0].id, cat.options[1].id];
    await setStaffOptions(S, staff[0], [ids.math]);
    ids.board = (await createBoard(S, boardName("c-exp"))).id;
    const linked = await addTeachersFromStaff(S, ids.board, staff);
    ids.linked1 = linked.find((t) => t.staffUserId === staff[0])!.id;
    ids.linked2 = linked.find((t) => t.staffUserId === staff[1])!.id;
    ids.placeholder = (await addTeachers(S, ids.board, ["ממלא מקום"]))[0].id;
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(S, ids.board);
    await archiveCategory(S, ids.cat);
    await testDb!.delete(schema.staffUsers).where(inArray(schema.staffUsers.id, staff));
  });

  const add = (input: unknown) => createConstraint(S, ids.board, input as ConstraintInput, MANAGEMENT);
  const exported = async () => exportConstraints(S, ids.board, await listTeachers(S, ids.board));

  it("turns a label into the teacher ids it reaches", async () => {
    const c = await add({ type: "teacher_unavailable", hard: true, weight: 100, params: { target: { kind: "label", optionId: ids.math }, day: 1 } });
    const out = await exported();
    expect(out.constraints.find((x) => x.id === c.id)).toEqual({
      id: c.id, type: "teacher_unavailable", hard: true, weight: 100, params: { teacherIds: [ids.linked1], day: 1 },
    });
  });

  it("adds a meeting as a class-less block and the input still parses", async () => {
    const c = await add({ type: "meeting", hard: true, weight: 100, params: { target: { kind: "label", optionId: ids.math }, weeklyPeriods: 2, consecutive: true } });
    expect((await exported()).meetingBlocks).toContainEqual({
      id: c.id, subjectId: null, classIds: [], teacherIds: [ids.linked1], weeklyPeriods: 2, consecutive: true,
    });
    const built = await buildSolverInput(S, ids.board);
    expect(built!.input.blocks.map((b) => b.id)).toContain(c.id);
    expect(built!.input.constraints.length).toBeGreaterThan(0);
  });

  it("counts meeting periods when a teacher is overbooked", async () => {
    for (let i = 0; i < 8; i++) {
      await add({ type: "meeting", hard: true, weight: 100, params: { target: { kind: "teachers", teacherIds: [ids.linked2] }, weeklyPeriods: 6, consecutive: false } });
    }
    const built = await buildSolverInput(S, ids.board);
    expect(built!.problems).toContainEqual(expect.objectContaining({ code: "teacher_overbooked", teacherId: ids.linked2 }));
  });

  it("drops a deleted teacher from a teacher list", async () => {
    const [gone] = await addTeachers(S, ids.board, ["עוזב"]);
    const c = await add({ type: "teacher_unavailable", hard: false, weight: 40, params: { target: { kind: "teachers", teacherIds: [ids.placeholder, gone.id] }, day: 3, periods: [1, 2] } });
    await deleteTeacher(S, gone.id);
    expect((await exported()).constraints.find((x) => x.id === c.id)?.params).toEqual({ teacherIds: [ids.placeholder], day: 3, periods: [1, 2] });
  });

  it("skips a free day whose teacher lost the entitlement", async () => {
    const c = await add({ type: "teacher_free_day", hard: true, weight: 100, teacherId: ids.placeholder, params: { day: 5 } });
    await updateTeacher(S, ids.placeholder, { freeDayEntitled: false });
    const out = await exported();
    expect(out.skipped).toContainEqual({ constraintId: c.id, reason: "not_entitled" });
    expect(out.constraints.map((x) => x.id)).not.toContain(c.id);
  });

  it("skips a label constraint once its option is archived", async () => {
    const c = await add({ type: "meeting", hard: true, weight: 100, params: { target: { kind: "label", optionId: ids.other }, weeklyPeriods: 1, consecutive: false } });
    const current = (await listCategories(S)).find((x) => x.id === ids.cat)!;
    await replaceCategory(S, ids.cat, {
      name: current.name, multiSelect: true, required: false, options: [{ id: ids.math, label: "מתמטיקה" }],
    });
    const out = await exported();
    expect(out.skipped).toContainEqual({ constraintId: c.id, reason: "reaches_no_one" });
    expect(out.meetingBlocks.map((b) => b.id)).not.toContain(c.id);
  });
});

