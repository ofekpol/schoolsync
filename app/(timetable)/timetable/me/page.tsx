import { getTranslations } from "next-intl/server";
import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { listMyBoards } from "@/lib/timetable/constraints/me";
import { MyBoards } from "@/components/timetable/constraints/MyBoards";

/** A teacher's own constraints: their free day on each board collecting answers (any role). */
export default async function MyTimetablePage() {
  const user = await requireActiveStaffPage();
  const [t, boards] = await Promise.all([
    getTranslations("timetable.me"),
    user.schoolId ? listMyBoards(user.schoolId, user.id) : Promise.resolve([]),
  ]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 text-neutral-950 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
      </div>
      <MyBoards boards={boards} />
    </main>
  );
}
