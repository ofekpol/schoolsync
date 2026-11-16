import { getTranslations } from "next-intl/server";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { listBoards } from "@/lib/timetable/boards";
import { BoardList } from "@/components/timetable/setup/BoardList";

/** timeTable home: admins see their boards and can start one; others see a placeholder. */
export default async function TimetablePage() {
  const user = await requireActiveStaffPage();
  const t = await getTranslations("timetable");
  if (user.role !== "admin" || !user.schoolId) {
    return (
      <main className="px-6 pt-6">
        <h1 className="text-2xl font-bold">{t("shell.title")}</h1>
        <p className="mt-3 text-neutral-500">{t("shell.empty")}</p>
      </main>
    );
  }
  const boards = await listBoards(user.schoolId);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 text-neutral-950 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("boards.title")}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t("boards.subtitle")}</p>
      </div>
      <BoardList boards={boards.map(({ id, name, status }) => ({ id, name, status }))} />
    </main>
  );
}
