import "server-only";
import { listStaffUsers } from "@/lib/db/staff";
import { listCategories } from "@/lib/profile/categories";
import { listStaffLabels } from "@/lib/profile/staff-labels";
import { createBlock } from "../blocks";
import { createBoard, deleteBoard, listBoards } from "../boards";
import { setGradeClassCount, type TtClass } from "../classes";
import { addSubjects } from "../subjects";
import { addTeachers, addTeachersFromStaff, updateTeacher } from "../teachers";
import { DEMO_BOARD_NAME } from "./curriculum";
import type { DemoPlan, DemoStaff } from "./generate";

// Blocks are independent, so a few are written at once (the pool holds 10).
const BLOCK_WRITE_CONCURRENCY = 8;

/** The school's active staff with their labels in `subjectCategory` ([] when it doesn't exist). */
export async function loadDemoStaff(schoolId: string, subjectCategory: string): Promise<DemoStaff[]> {
  const [staff, categories, labels] = await Promise.all([
    listStaffUsers(schoolId),
    listCategories(schoolId),
    listStaffLabels(schoolId),
  ]);
  const category = categories.find((c) => c.name === subjectCategory);
  const optionLabel = new Map((category?.options ?? []).map((o) => [o.id, o.label]));
  return staff
    .filter((person) => person.status === "active")
    .map((person) => ({
      staffUserId: person.id,
      fullName: person.fullName,
      subjects: (labels[person.id] ?? []).flatMap((optionId) => optionLabel.get(optionId) ?? []),
    }));
}

/** teacher key -> teacher id, writing linked staff, placeholders and anonymized names. */
async function writeTeachers(schoolId: string, boardId: string, plan: DemoPlan): Promise<Map<string, string>> {
  const linked = plan.teachers.filter((t) => t.staffUserId !== null);
  const placeholders = plan.teachers.filter((t) => t.staffUserId === null);
  const fromStaff = await addTeachersFromStaff(schoolId, boardId, linked.map((t) => t.staffUserId!));
  const added = await addTeachers(schoolId, boardId, placeholders.map((t) => t.fullName));
  const byStaff = new Map(fromStaff.map((t) => [t.staffUserId, t]));
  const byName = new Map(added.map((t) => [t.fullName, t.id]));
  const ids = new Map<string, string>();
  for (const teacher of linked) {
    const row = byStaff.get(teacher.staffUserId)!;
    ids.set(teacher.key, row.id);
    if (row.fullName !== teacher.fullName) await updateTeacher(schoolId, row.id, { fullName: teacher.fullName });
  }
  for (const teacher of placeholders) ids.set(teacher.key, byName.get(teacher.fullName)!);
  return ids;
}

/**
 * Replaces the school's demo board with `plan`, through the same domain
 * functions the screens use. Other boards are left alone.
 */
export async function writeDemoBoard(schoolId: string, plan: DemoPlan): Promise<{ boardId: string }> {
  const existing = (await listBoards(schoolId)).find((b) => b.name === DEMO_BOARD_NAME);
  if (existing) await deleteBoard(schoolId, existing.id);
  const board = await createBoard(schoolId, DEMO_BOARD_NAME);

  let classes: TtClass[] = [];
  for (const [grade, count] of Object.entries(plan.classCounts)) {
    classes = await setGradeClassCount(schoolId, board.id, Number(grade), count);
  }
  const classId = new Map(classes.map((c) => [`${c.grade}:${c.number}`, c.id]));
  const subjectId = new Map((await addSubjects(schoolId, board.id, plan.subjects)).map((s) => [s.name, s.id]));
  const teacherId = await writeTeachers(schoolId, board.id, plan);

  for (let i = 0; i < plan.blocks.length; i += BLOCK_WRITE_CONCURRENCY) {
    await Promise.all(
      plan.blocks.slice(i, i + BLOCK_WRITE_CONCURRENCY).map((block) =>
        createBlock(schoolId, board.id, {
          subjectId: subjectId.get(block.subject)!,
          weeklyPeriods: block.weeklyPeriods,
          classIds: block.classes.map((c) => classId.get(`${c.grade}:${c.number}`)!),
          teacherIds: block.teacherKeys.map((key) => teacherId.get(key)!),
        }),
      ),
    );
  }
  return { boardId: board.id };
}
