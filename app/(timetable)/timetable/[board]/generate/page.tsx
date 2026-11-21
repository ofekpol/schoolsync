import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { listCategories } from "@/lib/profile/categories";
import { getBoard } from "@/lib/timetable/boards";
import { listClasses } from "@/lib/timetable/classes";
import { listConstraints } from "@/lib/timetable/constraints/crud";
import { buildSolverInput } from "@/lib/timetable/export";
import { listRuns } from "@/lib/timetable/runs";
import { listTeachers } from "@/lib/timetable/teachers";
import { className } from "@/components/timetable/setup/className";
import { GeneratePanel } from "@/components/timetable/generate/GeneratePanel";

type Params = { params: Promise<{ board: string }> };

/** A board's timetable generation: start a run and compare the three options (admins only). */
export default async function BoardGeneratePage({ params }: Params) {
  const user = await requireActiveStaffPage();
  if (user.role !== "admin" || !user.schoolId) redirect("/timetable");
  const schoolId = user.schoolId;
  const boardId = z.string().uuid().safeParse((await params).board);
  const board = boardId.success ? await getBoard(schoolId, boardId.data) : null;
  if (!board) notFound();
  const [t, tGrades, runs, exported, constraints, teachers, classes, categories] = await Promise.all([
    getTranslations("timetable.generate"),
    getTranslations("grades"),
    listRuns(schoolId, board.id),
    buildSolverInput(schoolId, board.id),
    listConstraints(schoolId, board.id),
    listTeachers(schoolId, board.id),
    listClasses(schoolId, board.id),
    listCategories(schoolId),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-neutral-950 md:p-8">
      <div>
        <Link href={`/timetable/${board.id}/setup`} className="text-sm text-violet-700 hover:underline">{t("back")}</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("title", { name: board.name })}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">{t("subtitle")}</p>
      </div>
      <GeneratePanel boardId={board.id} problemCount={exported?.problems.length ?? 0} runs={runs} publishedSolutionId={board.publishedSolutionId} constraints={constraints}
        teacherNames={Object.fromEntries(teachers.map((x) => [x.id, x.fullName]))}
        classNames={Object.fromEntries(classes.map((c) => [c.id, className(c, (g) => tGrades(`label_${g}`))]))}
        optionNames={Object.fromEntries(categories.flatMap((c) => c.options.map((o) => [o.id, o.label])))} />
    </main>
  );
}
