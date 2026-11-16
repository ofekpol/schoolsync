import "server-only";
import { listStaffUsers } from "@/lib/db/staff";
import { listCategories } from "@/lib/profile/categories";
import { listBlocks } from "../blocks";
import { getBoard } from "../boards";
import { DEMO_SUBJECT_CATEGORY } from "../demo/curriculum";
import { listSubjects } from "../subjects";
import { listTeachers } from "../teachers";
import { fillInForTeacher } from "./collect";
import { createConstraint } from "./crud";
import { generateDemoConstraints, type DemoConstraintTeacher } from "./demo-plan";
import { exportConstraints } from "./export";

/** The board's teachers with the subjects they teach (from its lessons) and whether they are admins. */
async function demoTeachers(schoolId: string, boardId: string): Promise<DemoConstraintTeacher[]> {
  const [teachers, blocks, subjects, staff] = await Promise.all([
    listTeachers(schoolId, boardId),
    listBlocks(schoolId, boardId),
    listSubjects(schoolId, boardId),
    listStaffUsers(schoolId),
  ]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const admins = new Set(staff.filter((s) => s.role === "admin").map((s) => s.id));
  return teachers.map((t) => ({
    id: t.id,
    staffUserId: t.staffUserId,
    freeDayEntitled: t.freeDayEntitled,
    subjects: [...new Set(blocks.filter((b) => b.teacherIds.includes(t.id)).map((b) => subjectName.get(b.subjectId) ?? ""))],
    isAdmin: t.staffUserId !== null && admins.has(t.staffUserId),
  }));
}

/**
 * Writes the demo constraints into a board through the same domain functions
 * the screens use; free days are filled in as the teachers' answers.
 */
export async function writeDemoConstraints(
  schoolId: string,
  boardId: string,
  seed: number,
): Promise<{ written: number; skipped: number }> {
  const board = await getBoard(schoolId, boardId);
  if (!board) throw new Error("demo board not found");
  const [teachers, categories] = await Promise.all([demoTeachers(schoolId, boardId), listCategories(schoolId)]);
  const subjectCategory = categories.find((c) => c.name === DEMO_SUBJECT_CATEGORY);
  const mathOptionId = subjectCategory?.options.find((o) => o.label === "מתמטיקה")?.id ?? null;
  const inputs = generateDemoConstraints({ teachers, mathOptionId, days: board.week.days.map((d) => d.day), seed });
  for (const input of inputs) {
    if (input.type === "teacher_free_day") {
      await fillInForTeacher(schoolId, boardId, input.teacherId!, input.params.day, null);
    } else {
      await createConstraint(schoolId, boardId, input, { staffUserId: null, source: "management" });
    }
  }
  const { skipped } = await exportConstraints(schoolId, boardId, await listTeachers(schoolId, boardId));
  return { written: inputs.length, skipped: skipped.length };
}
