import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { listBoards } from "@/lib/timetable/boards";
import { BoardList } from "@/components/timetable/setup/BoardList";

/** timeTable home: admins see their boards and can start one; other staff go to their own page. */
export default async function TimetablePage() {
  const user = await requireActiveStaffPage();
  const t = await getTranslations("timetable");
  if (user.role !== "admin" || !user.schoolId) redirect("/timetable/me");
  const boards = await listBoards(user.schoolId);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 text-neutral-950 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("boards.title")}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t("boards.subtitle")}</p>
        <Link href="/timetable/me" className="mt-2 inline-block text-sm text-violet-700 hover:underline">{t("me.title")}</Link>
      </div>
      <BoardList boards={boards.map(({ id, name, status }) => ({ id, name, status }))} />
    </main>
  );
}
