import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { getBoard } from "@/lib/timetable/boards";
import { getSolutionGrid } from "@/lib/timetable/solutions";
import type { GridView } from "@/lib/timetable/grid";
import { TimetableGrid } from "@/components/timetable/generate/TimetableGrid";

type Props = {
  params: Promise<{ board: string; run: string; solution: string }>;
  searchParams: Promise<{ view?: string; id?: string }>;
};

const uuid = z.string().uuid();

/** One generated option as a read-only week grid, by class or teacher (admins only). */
export default async function SolutionGridPage({ params, searchParams }: Props) {
  const user = await requireActiveStaffPage();
  if (user.role !== "admin" || !user.schoolId) redirect("/timetable");
  const p = await params;
  const ids = z.object({ board: uuid, run: uuid, solution: uuid }).safeParse(p);
  if (!ids.success) notFound();
  const board = await getBoard(user.schoolId, ids.data.board);
  const grid = board ? await getSolutionGrid(user.schoolId, board.id, ids.data.run, ids.data.solution) : null;
  if (!board || !grid) notFound();

  const query = await searchParams;
  const kind: GridView["kind"] = query.view === "teacher" ? "teacher" : "class";
  const pool = Object.keys(kind === "class" ? grid.names.classes : grid.names.teachers);
  const id = query.id && pool.includes(query.id) ? query.id : pool[0] ?? "";
  const t = await getTranslations("timetable.generate");

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-neutral-950 md:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("gridTitle", { profile: t(`profile.${grid.solution.profile}`) })}</h1>
      <TimetableGrid boardId={board.id} grid={grid} view={{ kind, id }} />
    </main>
  );
}
