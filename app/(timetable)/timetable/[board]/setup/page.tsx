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
import { listTeachers } from "@/lib/timetable/teachers";
import { ClassesTab } from "@/components/timetable/setup/ClassesTab";
import { SubjectsTab } from "@/components/timetable/setup/SubjectsTab";
import { TeachersTab } from "@/components/timetable/setup/TeachersTab";
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
  const [t, panel] = await Promise.all([
    getTranslations("timetable.setup"),
    loadPanel(user.schoolId, board, tab),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-neutral-950 md:p-8">
      <div>
        <Link href="/timetable" className="text-sm text-violet-700 hover:underline">{t("back")}</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("title", { name: board.name })}</h1>
      </div>
      <SetupTabs boardId={board.id} active={tab} />
      {panel}
    </main>
  );
}

async function loadPanel(schoolId: string, board: Board, tab: SetupTab): Promise<ReactNode> {
  switch (tab) {
    case "subjects":
      return <SubjectsTab boardId={board.id} subjects={await listSubjects(schoolId, board.id)} />;
    case "teachers":
      return loadTeachers(schoolId, board.id);
    default:
      return <ClassesTab boardId={board.id} classes={await listClasses(schoolId, board.id)} />;
  }
}

async function loadTeachers(schoolId: string, boardId: string): Promise<ReactNode> {
  const [teachers, staff, categories, labels] = await Promise.all([
    listTeachers(schoolId, boardId),
    listStaffUsers(schoolId),
    listCategories(schoolId),
    listStaffLabels(schoolId),
  ]);
  const active = staff
    .filter((member) => member.status === "active")
    .map(({ id, fullName, email }) => ({ id, fullName, email }));
  return <TeachersTab boardId={boardId} teachers={teachers} staff={active} categories={categories} labels={labels} />;
}
