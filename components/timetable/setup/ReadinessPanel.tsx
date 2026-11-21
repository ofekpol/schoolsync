import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { TtBlock } from "@/lib/timetable/blocks";
import type { TtClass } from "@/lib/timetable/classes";
import type { InputProblem } from "@/lib/timetable/input-problems";
import type { TtSubject } from "@/lib/timetable/subjects";
import type { TtTeacher } from "@/lib/timetable/teachers";
import { className } from "./className";
import type { SetupTab } from "./SetupTabs";

interface Props {
  boardId: string;
  problems: InputProblem[];
  classes: TtClass[];
  subjects: TtSubject[];
  teachers: TtTeacher[];
  blocks: TtBlock[];
}

/** What keeps the board from being solvable as entered, each linking to the tab that fixes it. */
export async function ReadinessPanel({ boardId, problems, classes, subjects, teachers, blocks }: Props) {
  const t = await getTranslations("timetable.setup.readiness");
  const tGrades = await getTranslations("grades");
  if (problems.length === 0) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
        <CircleCheck aria-hidden className="size-4" />
        {t("ready")}
      </p>
    );
  }
  const label = (g: number) => tGrades(`label_${g}`);
  const classById = new Map(classes.map((c) => [c.id, className(c, label)]));
  const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherById = new Map(teachers.map((x) => [x.id, x.fullName]));
  const blockById = new Map(blocks.map((b) => [b.id, b]));

  function describe(problem: InputProblem): { text: string; tab: SetupTab } {
    if (problem.code === "block_without_teacher") {
      const block = blockById.get(problem.blockId);
      const classesText = block?.classIds.map((id) => classById.get(id)).join(", ") ?? "";
      const subject = block ? subjectById.get(block.subjectId) ?? "" : "";
      return { text: t("block_without_teacher", { subject, classes: classesText }), tab: (block?.classIds.length ?? 0) > 1 ? "plata" : "lessons" };
    }
    if (problem.code === "class_overbooked") {
      return { text: t("class_overbooked", { class: classById.get(problem.classId) ?? "", periods: problem.periods, slots: problem.slots }), tab: "lessons" };
    }
    return { text: t("teacher_overbooked", { teacher: teacherById.get(problem.teacherId) ?? "", periods: problem.periods, slots: problem.slots }), tab: "lessons" };
  }

  return (
    <section aria-label={t("title")} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <CircleAlert aria-hidden className="size-4" />
        {t("title")}
      </h2>
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {problems.map((problem, index) => {
          const { text, tab } = describe(problem);
          return (
            <li key={index} className="flex flex-wrap items-baseline gap-x-2">
              <span>{text}</span>
              <Link href={`/timetable/${boardId}/setup?tab=${tab}`} className="font-medium text-amber-900 underline underline-offset-2">
                {t("fix")}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
