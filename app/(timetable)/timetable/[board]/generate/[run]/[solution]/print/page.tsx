import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { getBoard } from "@/lib/timetable/boards";
import { getSolutionGrid } from "@/lib/timetable/solutions";
import { PrintSheets } from "@/components/timetable/edit/PrintSheets";
import { PrintButton } from "@/components/timetable/edit/PrintButton";

type Props = {
  params: Promise<{ board: string; run: string; solution: string }>;
  searchParams: Promise<{ view?: string }>;
};

const uuid = z.string().uuid();

/** Every class or teacher of one option, one A4 landscape page each (admins only). */
export default async function PrintSolutionPage({ params, searchParams }: Props) {
  const user = await requireActiveStaffPage();
  if (user.role !== "admin" || !user.schoolId) redirect("/timetable");
  const ids = z.object({ board: uuid, run: uuid, solution: uuid }).safeParse(await params);
  if (!ids.success) notFound();
  const board = await getBoard(user.schoolId, ids.data.board);
  const grid = board ? await getSolutionGrid(user.schoolId, board.id, ids.data.run, ids.data.solution) : null;
  if (!board || !grid) notFound();

  const kind = (await searchParams).view === "teacher" ? "teacher" : "class";
  const [t, tg] = await Promise.all([getTranslations("timetable.edit"), getTranslations("timetable.generate")]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-neutral-950 md:p-8 print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">{t("printTitle", { profile: tg(`profile.${grid.solution.profile}`) })}</h1>
        <PrintButton />
      </div>
      <PrintSheets grid={grid} kind={kind} />
    </main>
  );
}
