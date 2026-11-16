"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { MAX_WEEKLY_PERIODS } from "@/lib/validations/timetable";
import { cn } from "@/lib/utils";
import type { SetupErrorKey } from "./api";
import type { Cell } from "./lessons-grid";

export interface CellDraft {
  periods: number;
  teacherId: string | null;
}

interface Props {
  cell: Cell;
  label: string;
  row: number;
  col: number;
  /** Options of the shared teacher datalist: id and unique label. */
  teachers: Array<{ id: string; label: string }>;
  datalistId: string;
  onSave: (draft: CellDraft) => Promise<SetupErrorKey | null>;
}

function initial(cell: Cell, teachers: Props["teachers"]) {
  if (cell.kind !== "lesson") return { periods: "", teacher: "" };
  const teacherId = cell.block.teacherIds[0];
  return {
    periods: String(cell.block.weeklyPeriods),
    teacher: teachers.find((t) => t.id === teacherId)?.label ?? "",
  };
}

/** One class × subject cell: weekly periods and one teacher. Saves on Enter or when focus leaves it. */
export function LessonCell({ cell, label, row, col, teachers, datalistId, onSave }: Props) {
  const t = useTranslations("timetable.setup");
  const start = initial(cell, teachers);
  const [periods, setPeriods] = useState(start.periods);
  const [teacher, setTeacher] = useState(start.teacher);
  const [error, setError] = useState<SetupErrorKey | "unknownTeacher" | null>(null);

  if (cell.kind === "plata") {
    return <span className="block px-2 py-1 text-center text-xs text-violet-700">{t("lessons.inPlata")}</span>;
  }

  const dirty = periods !== start.periods || teacher !== start.teacher;

  async function save() {
    if (!dirty) return;
    const count = periods.trim() === "" ? 0 : Number(periods);
    const teacherId = teacher.trim() === "" ? null : teachers.find((o) => o.label === teacher.trim())?.id;
    if (!Number.isInteger(count) || count < 0 || count > MAX_WEEKLY_PERIODS) return setError("save");
    if (teacherId === undefined) return setError("unknownTeacher");
    setError(null);
    const failure = await onSave({ periods: count, teacherId });
    if (failure) setError(failure);
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void save();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  return (
    <div onBlur={onBlur} className={cn("flex flex-col gap-1 p-1", error && "rounded-md ring-2 ring-red-400")}>
      <input type="number" min={0} max={MAX_WEEKLY_PERIODS} inputMode="numeric" value={periods}
        aria-label={`${label} · ${t("lessons.periods")}`} data-row={row} data-col={col}
        onChange={(e) => setPeriods(e.target.value)} onKeyDown={onKeyDown}
        className="h-7 w-full rounded border border-neutral-300 px-1 text-center tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
      <input list={datalistId} value={teacher} placeholder={t("lessons.noTeacher")}
        aria-label={`${label} · ${t("lessons.teacher")}`}
        onChange={(e) => setTeacher(e.target.value)} onKeyDown={onKeyDown}
        className="h-7 w-full min-w-24 rounded border border-neutral-200 px-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error === "unknownTeacher" ? t("lessons.unknownTeacher") : t(`errors.${error}`)}
        </span>
      )}
    </div>
  );
}
