"use client";

import { useTranslations } from "next-intl";

/**
 * Live-region spinner shown while the weekly/monthly view is being swapped in.
 * The fade-in is delayed so fast switches never flash it.
 */
export function ViewSwitchStatus({ pending }: { pending: boolean }) {
  const tc = useTranslations("common");
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-[13px] text-neutral-600 transition-opacity delay-200 duration-150 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      {pending && (
        <>
          <span
            aria-hidden="true"
            className="size-4 rounded-full border-2 border-blue-100 border-t-blue-600 motion-safe:animate-spin"
          />
          {tc("loading")}
        </>
      )}
    </span>
  );
}
