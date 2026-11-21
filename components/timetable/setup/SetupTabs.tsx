import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export const SETUP_TABS = ["classes", "subjects", "teachers", "lessons", "plata", "constraints"] as const;
export type SetupTab = (typeof SETUP_TABS)[number];

/** "plata" is the lessons tab's second view (groups and majors), not a tab of its own. */
const NAV_TABS = SETUP_TABS.filter((tab) => tab !== "plata");

export function parseSetupTab(value: string | undefined): SetupTab {
  return SETUP_TABS.find((tab) => tab === value) ?? "classes";
}

/** The board's setup sections as links (`?tab=`); the page loads only the active one. */
export async function SetupTabs({ boardId, active }: { boardId: string; active: SetupTab }) {
  const t = await getTranslations("timetable.setup");
  return (
    <nav aria-label={t("tabsLabel")}
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      {NAV_TABS.map((tab) => (
        <Link key={tab} href={`/timetable/${boardId}/setup?tab=${tab}`}
          aria-current={tab === navTab(active) ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
            tab === navTab(active)
              ? "border-violet-600 font-semibold text-neutral-950"
              : "border-transparent text-neutral-500 hover:text-neutral-800",
          )}>
          {t(`tabs.${tab}`)}
        </Link>
      ))}
    </nav>
  );
}

const navTab = (tab: SetupTab): SetupTab => (tab === "plata" ? "lessons" : tab);

/** The lessons tab's two views: homeroom classes (`lessons`) and groups and majors (`plata`). */
export async function LessonViews({ boardId, active }: { boardId: string; active: "lessons" | "plata" }) {
  const t = await getTranslations("timetable.setup.lessonViews");
  const views = [["lessons", t("homeroom")], ["plata", t("groups")]] as const;
  return (
    <nav aria-label={t("label")} className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
      {views.map(([view, label]) => (
        <Link key={view} href={`/timetable/${boardId}/setup?tab=${view}`}
          aria-current={view === active ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm",
            view === active ? "bg-white font-semibold text-neutral-950 shadow-sm" : "text-neutral-600 hover:text-neutral-900")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
