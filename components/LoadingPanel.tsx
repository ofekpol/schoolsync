"use client";

import { useTranslations } from "next-intl";

/**
 * Shared loading skeleton used by every route-group `loading.tsx`.
 * Visible only during streaming SSR — keeps the screen reader engaged
 * with an aria-live message instead of staring at a blank page.
 */
export function LoadingPanel({ compact = false }: { compact?: boolean }) {
  const tc = useTranslations("common");
  return (
    <main className={`${compact ? "min-h-[18rem]" : "min-h-screen"} flex items-center justify-center p-6`}>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-sm text-neutral-600">
        <span
          data-testid="loading-indicator"
          aria-hidden="true"
          className="size-8 rounded-full border-2 border-blue-100 border-t-blue-600 motion-safe:animate-spin"
        />
        <span>{tc("loading")}</span>
      </div>
    </main>
  );
}
