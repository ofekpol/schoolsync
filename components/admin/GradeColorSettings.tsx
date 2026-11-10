"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatGradeLabel } from "@/lib/grades";
import {
  DEFAULT_GRADE_COLORS,
  GRADE_COLOR_OPTIONS,
  SCHOOL_GRADES,
  gradeTextColor,
  type GradeColorMap,
} from "@/lib/grade-colors";
import { cn } from "@/lib/utils";

interface Props {
  initial: GradeColorMap;
}

type SaveState = "idle" | "saving" | "saved" | "error";

async function persist(colors: GradeColorMap): Promise<boolean> {
  const res = await fetch("/api/v1/admin/grade-colors", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      colors: SCHOOL_GRADES.map((grade) => ({ grade, colorHex: colors[grade] })),
    }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Admin picker for per-grade calendar colors (curated palette). Saves on every pick. */
export function GradeColorSettings({ initial }: Props) {
  const t = useTranslations("admin.gradeColors");
  const [colors, setColors] = useState<GradeColorMap>(initial);
  const [state, setState] = useState<SaveState>("idle");

  async function apply(next: GradeColorMap) {
    const previous = colors;
    setColors(next);
    setState("saving");
    const ok = await persist(next);
    if (!ok) setColors(previous);
    setState(ok ? "saved" : "error");
  }

  const status = { idle: "", saving: t("saving"), saved: t("saved"), error: t("error") }[state];

  return (
    <section aria-labelledby="grade-colors-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="grade-colors-title" className="text-base font-semibold">{t("title")}</h2>
        <span role="status" className={cn("text-xs", state === "error" ? "text-destructive" : "text-neutral-500")}>
          {status}
        </span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">{t("description")}</p>
      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {SCHOOL_GRADES.map((grade) => (
          <GradeColorRow
            key={grade}
            grade={grade}
            color={colors[grade]}
            duplicateOf={SCHOOL_GRADES.find((other) => other !== grade && colors[other] === colors[grade])}
            onPick={(color) => color !== colors[grade] && apply({ ...colors, [grade]: color })}
          />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => apply({ ...DEFAULT_GRADE_COLORS })}
        disabled={state === "saving"}
        className="mt-2 text-xs text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
      >
        {t("reset")}
      </button>
    </section>
  );
}

interface RowProps {
  grade: number;
  color: string;
  duplicateOf: number | undefined;
  onPick: (color: string) => void;
}

function GradeColorRow({ grade, color, duplicateOf, onPick }: RowProps) {
  const t = useTranslations("admin.gradeColors");
  const label = formatGradeLabel(grade);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
      <span
        className="inline-flex h-7 w-16 items-center justify-center rounded-md text-xs font-semibold"
        style={{ backgroundColor: color, color: gradeTextColor(color) }}
      >
        {t("gradeLabel", { grade: label })}
      </span>
      <div role="radiogroup" aria-label={t("gradeLabel", { grade: label })} className="flex flex-wrap gap-1">
        {GRADE_COLOR_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === color}
            aria-label={t("colorOption", { grade: label, color: option })}
            onClick={() => onPick(option)}
            className={cn(
              "size-6 rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              option === color ? "ring-2 ring-neutral-900 ring-offset-1" : "border-black/15 hover:scale-110",
            )}
            style={{ backgroundColor: option }}
          />
        ))}
      </div>
      {duplicateOf !== undefined && (
        <span className="text-xs font-medium text-amber-800">
          {t("duplicate", { grade: formatGradeLabel(duplicateOf) })}
        </span>
      )}
    </li>
  );
}
