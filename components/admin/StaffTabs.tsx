"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StaffTab {
  id: string;
  label: string;
  /** Shown as a small badge beside the label. */
  count?: number;
  /** Highlight the badge (work waiting, e.g. pending sign-ups). */
  attention?: boolean;
  panel: ReactNode;
}

/**
 * Accessible tab strip for the staff page. Every panel stays mounted (just
 * hidden) so filters and form drafts survive switching tabs. The chosen tab
 * is mirrored to `?tab=` so a refresh or shared link lands on it.
 */
export function StaffTabs({
  tabs,
  initialTab,
  pendingCount = 0,
  requestsTabId = "requests",
}: {
  tabs: StaffTab[];
  initialTab?: string;
  pendingCount?: number;
  requestsTabId?: string;
}) {
  const t = useTranslations("admin.staff");
  const first = tabs[0]?.id ?? "";
  const [active, setActive] = useState(
    tabs.some((tab) => tab.id === initialTab) ? (initialTab as string) : first,
  );
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasRequestsTab = tabs.some((tab) => tab.id === requestsTabId);

  function select(id: string, focus = false) {
    setActive(id);
    if (focus) tabRefs.current[id]?.focus();
    const url = new URL(window.location.href);
    if (id === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    // RTL: the visual "next" tab is to the left.
    const step = { ArrowLeft: 1, ArrowRight: -1 }[event.key];
    if (event.key === "Home") select(tabs[0]!.id, true);
    else if (event.key === "End") select(tabs[tabs.length - 1]!.id, true);
    else if (step) select(tabs[(index + step + tabs.length) % tabs.length]!.id, true);
    else return;
    event.preventDefault();
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        onKeyDown={onKeyDown}
        className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-neutral-200 px-4 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`staff-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`staff-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                selected
                  ? "border-violet-600 font-semibold text-neutral-950"
                  : "border-transparent text-neutral-500 hover:text-neutral-800",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-medium tabular-nums",
                    tab.attention
                      ? "bg-amber-400 text-amber-950"
                      : selected
                        ? "bg-violet-100 text-violet-800"
                        : "bg-neutral-100 text-neutral-600",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active === first && pendingCount > 0 && hasRequestsTab && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-amber-700" aria-hidden />
            {t("pendingBanner", { count: pendingCount })}
          </span>
          <button
            type="button"
            onClick={() => select(requestsTabId)}
            className="inline-flex items-center gap-1 font-semibold text-amber-900 underline-offset-4 hover:underline"
          >
            {t("reviewRequests")}
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`staff-panel-${tab.id}`}
          aria-labelledby={`staff-tab-${tab.id}`}
          hidden={tab.id !== active}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
