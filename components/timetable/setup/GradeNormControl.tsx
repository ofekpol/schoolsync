"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { MAX_WEEKLY_PERIODS } from "@/lib/validations/timetable";
import { cn } from "@/lib/utils";
import type { SetupErrorKey } from "./api";

interface Props {
  subject: string;
  /** The grade's current standard for the subject (0 = none). */
  norm: number;
  /** How many classes differ from the standard. */
  differing: number;
  onApply: (periods: number) => Promise<SetupErrorKey | null>;
}

/** A subject row's weekly periods for the whole grade: type a number, apply it to every class. */
export function GradeNormControl({ subject, norm, differing, onApply }: Props) {
  const t = useTranslations("timetable.setup.lessons");
  const tErrors = useTranslations("timetable.setup.errors");
  const [value, setValue] = useState(norm === 0 ? "" : String(norm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const count = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(count) && count >= 1 && count <= MAX_WEEKLY_PERIODS;
  const pending = valid && (count !== norm || differing > 0);

  async function apply() {
    if (!pending || busy) return;
    setBusy(true);
    const failure = await onApply(count);
    setBusy(false);
    setError(failure);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void apply();
  }

  return (
    <div className="mt-1 flex items-center gap-1">
      <input type="number" min={1} max={MAX_WEEKLY_PERIODS} inputMode="numeric" value={value}
        aria-label={t("normLabel", { subject })} title={t("normHint")}
        onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown}
        className={cn("h-7 w-12 rounded border border-violet-300 bg-violet-50 px-1 text-center text-xs font-semibold tabular-nums",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500", error && "ring-2 ring-red-400")} />
      <button type="button" onClick={() => void apply()} disabled={!pending || busy}
        aria-label={t("applyNorm", { subject })} title={t("applyNorm", { subject })}
        className="inline-flex size-7 items-center justify-center rounded border border-violet-300 text-violet-700 hover:bg-violet-100 disabled:opacity-30">
        <Check aria-hidden className="size-3.5" />
      </button>
      {error && <span role="alert" className="sr-only">{tErrors(error)}</span>}
    </div>
  );
}
