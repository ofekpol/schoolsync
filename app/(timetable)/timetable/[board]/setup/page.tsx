import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { listStaffUsers } from "@/lib/db/staff";
import { listCategories } from "@/lib/profile/categories";
import { listStaffLabels } from "@/lib/profile/staff-labels";
import { getBoard, type Board } from "@/lib/timetable/boards";
import { listClasses } from "@/lib/timetable/classes";
import { listSubjects } from "@/lib/timetable/subjects";
import { listTeachers, type TtTeacher } from "@/lib/timetable/teachers";
import { listBlocks } from "@/lib/timetable/blocks";
import { buildSolverInput } from "@/lib/timetable/export";
import { slotCount } from "@/lib/timetable/week";
import { ClassesTab } from "@/components/timetable/setup/ClassesTab";
import { SubjectsTab } from "@/components/timetable/setup/SubjectsTab";
import { TeachersTab } from "@/components/timetable/setup/TeachersTab";
import { LessonsTab } from "@/components/timetable/setup/LessonsTab";
import { PlataTab } from "@/components/timetable/setup/PlataTab";
import { ReadinessPanel } from "@/components/timetable/setup/ReadinessPanel";
import { ConstraintsTab } from "@/components/timetable/constraints/ConstraintsTab";
import { listConstraints } from "@/lib/timetable/constraints/crud";
import { exportConstraints } from "@/lib/timetable/constraints/export";
import { parseSetupTab, SetupTabs, type SetupTab } from "@/components/timetable/setup/SetupTabs";

type Params = { params: Promise<{ board: string }>; searchParams: Promise<{ tab?: string }> };

/** A board's setup: classes, subjects, teachers, lessons and Plata (admins only). */
export default async function BoardSetupPage({ params, searchParams }: Params) {
  const user = await requireActiveStaffPage();
  if (user.role !== "admin" || !user.schoolId) redirect("/timetable");
  const [{ board: boardParam }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const boardId = z.string().uuid().safeParse(boardParam);
  const board = boardId.success ? await getBoard(user.schoolId, boardId.data) : null;
  if (!board) notFound();
  const tab = parseSetupTab(tabParam);
  const schoolId = user.schoolId;
  const [t, data, exported] = await Promise.all([
    getTranslations("timetable.setup"),
    loadBoardData(schoolId, board.id),
    buildSolverInput(schoolId, board.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-neutral-950 md:p-8">
      <div>
        <Link href="/timetable" className="text-sm text-violet-700 hover:underline">{t("back")}</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("title", { name: board.name })}</h1>
      </div>
      <ReadinessPanel boardId={board.id} problems={exported?.problems ?? []} {...data} />
      <SetupTabs boardId={board.id} active={tab} />
      {await renderPanel(schoolId, board, tab, data)}
    </main>
  );
}

type BoardData = Awaited<ReturnType<typeof loadBoardData>>;

async function loadBoardData(schoolId: string, boardId: string) {
  const [classes, subjects, teachers, blocks] = await Promise.all([
    listClasses(schoolId, boardId),
    listSubjects(schoolId, boardId),
    listTeachers(schoolId, boardId),
    listBlocks(schoolId, boardId),
  ]);
  return { classes, subjects, teachers, blocks };
}

async function renderPanel(schoolId: string, board: Board, tab: SetupTab, data: BoardData): Promise<ReactNode> {
  switch (tab) {
    case "subjects":
      return <SubjectsTab boardId={board.id} subjects={data.subjects} />;
    case "teachers":
      return loadTeachers(schoolId, board.id, data.teachers);
    case "lessons":
      return <LessonsTab boardId={board.id} slots={slotCount(board.week)} {...data} />;
    case "plata":
      return <PlataTab boardId={board.id} {...data} />;
    case "constraints":
      return loadConstraints(schoolId, board, data.teachers);
    default:
      return <ClassesTab boardId={board.id} classes={data.classes} />;
  }
}

async function loadTeachers(schoolId: string, boardId: string, teachers: TtTeacher[]): Promise<ReactNode> {
  const [staff, categories, labels] = await Promise.all([
    listStaffUsers(schoolId),
    listCategories(schoolId),
    listStaffLabels(schoolId),
  ]);
  const active = staff
    .filter((member) => member.status === "active")
    .map(({ id, fullName, email }) => ({ id, fullName, email }));
  return <TeachersTab boardId={boardId} teachers={teachers} staff={active} categories={categories} labels={labels} />;
}

async function loadConstraints(schoolId: string, board: Board, teachers: TtTeacher[]): Promise<ReactNode> {
  const [constraints, categories, labels, exported] = await Promise.all([
    listConstraints(schoolId, board.id),
    listCategories(schoolId),
    listStaffLabels(schoolId),
    exportConstraints(schoolId, board.id, teachers),
  ]);
  return (
    <ConstraintsTab boardId={board.id} constraints={constraints} skipped={exported.skipped} teachers={teachers}
      categories={categories} labels={labels} week={board.week} />
  );
}
