import { getTranslations } from "next-intl/server";

/** timeTable home. Placeholder until the timeTable plans land. */
export default async function TimetablePage() {
  const t = await getTranslations("timetable.shell");
  return (
    <main className="px-6 pt-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-neutral-500">{t("empty")}</p>
    </main>
  );
}
