"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TtClass } from "@/lib/timetable/classes";
import { MAX_CLASSES_PER_GRADE, MAX_GRADE, MIN_GRADE } from "@/lib/validations/timetable";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { className } from "./className";

const GRADES = Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => MIN_GRADE + i);

/** One row per grade: how many classes it has, and their names. */
export function ClassesTab({ boardId, classes }: { boardId: string; classes: TtClass[] }) {
  const t = useTranslations("timetable.setup");
  return (
    <div className="space-y-3">
      <p className="max-w-xl text-sm text-neutral-600">{t("classes.hint")}</p>
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
        {GRADES.map((grade) => (
          <GradeRow key={grade} boardId={boardId} grade={grade}
            count={classes.filter((c) => c.grade === grade).length} />
        ))}
      </ul>
    </div>
  );
}

function GradeRow({ boardId, grade, count }: { boardId: string; grade: number; count: number }) {
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const [value, setValue] = useState(String(count));
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const label = (g: number) => tGrades(`label_${g}`);

  async function save() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0 || next > MAX_CLASSES_PER_GRADE) return setValue(String(count));
    if (next === count) return;
    setError(null);
    const res = await api.setClassCount(boardId, grade, next);
    if (!res.ok) {
      setValue(String(count));
      return setError(res.error === "inUse" ? "inUse" : res.error);
    }
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
      <label className="flex items-center gap-3 text-sm">
        <span className="w-14 font-semibold">{t("classes.grade", { grade: label(grade) })}</span>
        <input type="number" min={0} max={MAX_CLASSES_PER_GRADE} value={value} inputMode="numeric"
          aria-label={t("classes.count", { grade: label(grade) })}
          onChange={(e) => setValue(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          className="h-8 w-16 rounded-md border border-neutral-300 px-2 text-center tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
      </label>
      <span className="text-sm text-neutral-600">
        {count === 0
          ? t("classes.none")
          : Array.from({ length: count }, (_, i) => className(grade, i + 1, label)).join(" · ")}
      </span>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error === "inUse" ? t("classes.inUse") : t(`errors.${error}`)}
        </p>
      )}
    </li>
  );
}
