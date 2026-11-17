"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Unlink } from "lucide-react";
import type { TtBlock } from "@/lib/timetable/blocks";
import { MAX_WEEKLY_PERIODS } from "@/lib/validations/timetable";
import { cn } from "@/lib/utils";
import type { SetupErrorKey } from "./api";
import { DiffersDot } from "./DiffersDot";

interface Props {
  block: TtBlock;
  label: string;
  /** The grade's standard for this subject; a Plata that differs shows a small dot. */
  norm: number;
  row: number;
  col: number;
  /** Saves the Plata's weekly periods (every class in it). */
  onPeriods: (periods: number) => Promise<SetupErrorKey | null>;
  /** Takes this class out of the Plata, giving it its own lesson. */
  onDetach: () => Promise<SetupErrorKey | null>;
}

/** A class's cell when it learns the subject in a Plata: the Plata's hours, editable, and a way out. */
export function PlataCell({ block, label, norm, row, col, onPeriods, onDetach }: Props) {
  const t = useTranslations("timetable.setup");
  const [periods, setPeriods] = useState(String(block.weeklyPeriods));
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<SetupErrorKey | null>) {
    setBusy(true);
    const failure = await action();
    setBusy(false);
    setError(failure);
  }

  function save() {
    const count = Number(periods);
    if (count === block.weeklyPeriods) return;
    if (!Number.isInteger(count) || count < 1 || count > MAX_WEEKLY_PERIODS) return setError("save");
    void run(() => onPeriods(count));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    save();
  }

  return (
    <div className={cn("relative flex flex-col gap-1 p-1", error && "rounded-md ring-2 ring-red-400")}>
      {block.weeklyPeriods !== norm && <DiffersDot norm={norm} />}
      <input type="number" min={1} max={MAX_WEEKLY_PERIODS} inputMode="numeric" value={periods} disabled={busy}
        aria-label={`${label} · ${t("lessons.plataPeriods")}`} title={t("lessons.plataPeriodsHint")}
        data-row={row} data-col={col}
        onChange={(e) => setPeriods(e.target.value)} onBlur={save} onKeyDown={onKeyDown}
        className="h-7 w-full rounded border border-violet-300 bg-violet-50 px-1 text-center tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
      <span className="flex h-7 items-center justify-between gap-1 px-1 text-xs text-violet-700">
        {t("lessons.inPlata")}
        <button type="button" disabled={busy} onClick={() => void run(onDetach)}
          aria-label={t("lessons.detach", { class: label })} title={t("lessons.detachHint")}
          className="inline-flex size-5 items-center justify-center rounded text-violet-600 hover:bg-violet-100 disabled:opacity-40">
          <Unlink aria-hidden className="size-3.5" />
        </button>
      </span>
      {error && <span role="alert" className="text-xs text-red-700">{t(`errors.${error}`)}</span>}
    </div>
  );
}
