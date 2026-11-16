import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { getBoard } from "@/lib/timetable/boards";
import { listTeachers } from "@/lib/timetable/teachers";
import { getCollectState, listResponses } from "@/lib/timetable/constraints/collect";
import { CollectPanel } from "@/components/timetable/constraints/CollectPanel";

type Params = { params: Promise<{ board: string }> };

/** A board's constraint collection round (admins only). */
export default async function BoardCollectPage({ params }: Params) {
  const user = await requireActiveStaffPage();
  if (user.role !== "admin" || !user.schoolId) redirect("/timetable");
  const boardId = z.string().uuid().safeParse((await params).board);
  const board = boardId.success ? await getBoard(user.schoolId, boardId.data) : null;
  if (!board) notFound();
  const [t, state, responses, teachers] = await Promise.all([
    getTranslations("timetable.collect"),
    getCollectState(user.schoolId, board.id),
    listResponses(user.schoolId, board.id),
    listTeachers(user.schoolId, board.id),
  ]);
  if (!state) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 text-neutral-950 md:p-8">
      <div>
        <Link href={`/timetable/${board.id}/setup`} className="text-sm text-violet-700 hover:underline">{t("back")}</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("title", { name: board.name })}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">{t("subtitle")}</p>
      </div>
      <CollectPanel boardId={board.id} state={state} responses={responses} days={board.week.days.map((d) => d.day)}
        teachers={teachers.map(({ id, fullName, freeDayEntitled }) => ({ id, fullName, freeDayEntitled }))} />
    </main>
  );
}
