"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { formatGradeLabel } from "@/lib/grades";
import {
  DEFAULT_GRADE_COLORS,
  SCHOOL_GRADES,
  gradeTextColor,
  type GradeColorMap,
} from "@/lib/grade-colors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GradeColorGrid } from "@/components/admin/GradeColorGrid";
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

/** Pairs of grades that share a color, each pair once (e.g. [[7, 9]]). */
function duplicatePairs(colors: GradeColorMap): [number, number][] {
  const pairs: [number, number][] = [];
  SCHOOL_GRADES.forEach((a, i) => {
    for (const b of SCHOOL_GRADES.slice(i + 1)) if (colors[a] === colors[b]) pairs.push([a, b]);
  });
  return pairs;
}

/**
 * Admin per-grade calendar colors: one chip per grade; clicking a chip opens
 * the palette. Saves on every pick.
 */
export function GradeColorSettings({ initial }: Props) {
  const t = useTranslations("admin.gradeColors");
  const [colors, setColors] = useState<GradeColorMap>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [openGrade, setOpenGrade] = useState<number | null>(null);

  async function apply(next: GradeColorMap) {
    const previous = colors;
    setColors(next);
    setOpenGrade(null);
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
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SCHOOL_GRADES.map((grade) => (
          <Popover key={grade} open={openGrade === grade}
            onOpenChange={(open) => setOpenGrade(open ? grade : null)}>
            <PopoverTrigger
              aria-label={t("changeColor", { grade: formatGradeLabel(grade) })}
              className="flex h-9 items-center justify-center gap-1 rounded-md text-xs font-semibold shadow-xs ring-1 ring-black/10 transition hover:ring-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: colors[grade], color: gradeTextColor(colors[grade]) }}
            >
              {t("gradeLabel", { grade: formatGradeLabel(grade) })}
              <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <GradeColorGrid grade={grade} colors={colors}
                onPick={(color) => (color === colors[grade] ? setOpenGrade(null) : apply({ ...colors, [grade]: color }))} />
            </PopoverContent>
          </Popover>
        ))}
      </div>
      {duplicatePairs(colors).map(([a, b]) => (
        <p key={`${a}-${b}`} className="mt-2 text-xs font-medium text-amber-800">
          {t("duplicatePair", { a: formatGradeLabel(a), b: formatGradeLabel(b) })}
        </p>
      ))}
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
