import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export const SETUP_TABS = ["classes", "subjects", "teachers", "lessons", "plata", "constraints"] as const;
export type SetupTab = (typeof SETUP_TABS)[number];

export function parseSetupTab(value: string | undefined): SetupTab {
  return SETUP_TABS.find((tab) => tab === value) ?? "classes";
}

/** The board's setup sections as links (`?tab=`); the page loads only the active one. */
export async function SetupTabs({ boardId, active }: { boardId: string; active: SetupTab }) {
  const t = await getTranslations("timetable.setup");
  return (
    <nav aria-label={t("tabsLabel")}
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      {SETUP_TABS.map((tab) => (
        <Link key={tab} href={`/timetable/${boardId}/setup?tab=${tab}`}
          aria-current={tab === active ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
            tab === active
              ? "border-violet-600 font-semibold text-neutral-950"
              : "border-transparent text-neutral-500 hover:text-neutral-800",
          )}>
          {t(`tabs.${tab}`)}
        </Link>
      ))}
    </nav>
  );
}
