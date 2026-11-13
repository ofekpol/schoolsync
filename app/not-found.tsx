import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Root not-found page in the app's language (e.g. /timetable for a school without timeTable). */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-3">
        <h1 className="text-lg font-semibold">{t("notFound")}</h1>
        <p className="text-sm text-neutral-600">{t("notFoundHint")}</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
