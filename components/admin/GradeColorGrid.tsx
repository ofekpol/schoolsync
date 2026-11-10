"use client";

import { useTranslations } from "next-intl";
import { formatGradeLabel } from "@/lib/grades";
import {
  GRADE_COLOR_OPTIONS,
  SCHOOL_GRADES,
  gradeTextColor,
  type GradeColorMap,
} from "@/lib/grade-colors";
import { cn } from "@/lib/utils";

/**
 * The grade palette (two rows of nine). Colors another grade already uses
 * carry that grade's letter, so duplicates are visible before picking.
 */
export function GradeColorGrid({ grade, colors, onPick }: {
  grade: number;
  colors: GradeColorMap;
  onPick: (color: string) => void;
}) {
  const t = useTranslations("admin.gradeColors");
  const label = formatGradeLabel(grade);
  return (
    <div role="radiogroup" aria-label={t("gradeLabel", { grade: label })} className="grid grid-cols-9 gap-1.5">
      {GRADE_COLOR_OPTIONS.map((option) => {
        const selected = option === colors[grade];
        const usedBy = SCHOOL_GRADES.find((other) => other !== grade && colors[other] === option);
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t("colorOption", { grade: label, color: option })}
            title={usedBy !== undefined ? t("duplicate", { grade: formatGradeLabel(usedBy) }) : undefined}
            onClick={() => onPick(option)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "ring-2 ring-neutral-900 ring-offset-1" : "border-black/15 hover:scale-110",
            )}
            style={{ backgroundColor: option, color: gradeTextColor(option) }}
          >
            {usedBy !== undefined && formatGradeLabel(usedBy)}
          </button>
        );
      })}
    </div>
  );
}
