"use client";

import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

export function PublicViewerEntryLoading() {
  const t = useTranslations("publicViewerLoading");

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_var(--sg-surface-raised),_var(--sg-page)_68%)] p-6">
      <div role="status" aria-live="polite" className="flex max-w-xs flex-col items-center gap-5 text-center">
        <div
          data-testid="public-viewer-entry-visual"
          aria-hidden="true"
          className="relative flex size-20 items-center justify-center rounded-[1.75rem] bg-blue-600 text-white shadow-[0_18px_48px_rgba(37,99,235,0.25)] motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]"
        >
          <CalendarDays className="size-9" strokeWidth={1.75} />
          <span className="absolute -inset-2 rounded-[2rem] border border-blue-200 motion-safe:animate-ping" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-neutral-900">{t("title")}</p>
          <p className="text-sm text-neutral-600">{t("detail")}</p>
        </div>
        <span aria-hidden="true" className="h-1 w-28 overflow-hidden rounded-full bg-blue-100">
          <span className="block h-full w-1/2 rounded-full bg-blue-600 motion-safe:animate-[sg-route-progress_1.1s_ease-in-out_infinite]" />
        </span>
      </div>
    </main>
  );
}
