"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TtBlock } from "@/lib/timetable/blocks";
import type { TtClass } from "@/lib/timetable/classes";
import type { TtSubject } from "@/lib/timetable/subjects";
import type { BlockInput } from "@/lib/validations/timetable";
import { MAX_CLASSES_PER_GRADE, MAX_WEEKLY_PERIODS } from "@/lib/validations/timetable";

/** BlockInputSchema caps a block's teachers at MAX_CLASSES_PER_GRADE. */
const MAX_BLOCK_TEACHERS = MAX_CLASSES_PER_GRADE;
import type { SetupErrorKey } from "./api";
import { className } from "./className";
import { teacherOptions } from "./lessons-grid";

interface Props {
  block: TtBlock | null;
  classes: TtClass[];
  subjects: TtSubject[];
  teachers: Array<{ id: string; fullName: string }>;
  onSave: (input: BlockInput) => Promise<SetupErrorKey | null>;
  onCancel: () => void;
}

/** Form for a Plata: grade, subject, weekly periods, its classes (two or more) and teachers. */
export function PlataEditor({ block, classes, subjects, teachers, onSave, onCancel }: Props) {
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const grades = [...new Set(classes.map((c) => c.grade))];
  const firstClass = classes.find((c) => c.id === block?.classIds[0]);
  const [grade, setGrade] = useState(firstClass?.grade ?? grades[0] ?? 7);
  const [subjectId, setSubjectId] = useState(block?.subjectId ?? subjects[0]?.id ?? "");
  const [periods, setPeriods] = useState(block?.weeklyPeriods ?? 1);
  const [classIds, setClassIds] = useState(new Set(block?.classIds ?? []));
  const [teacherIds, setTeacherIds] = useState(new Set(block?.teacherIds ?? []));
  const [teacherFilter, setTeacherFilter] = useState("");
  const [error, setError] = useState<SetupErrorKey | "needTwoClasses" | "tooManyTeachers" | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (g: number) => tGrades(`label_${g}`);
  const gradeClasses = classes.filter((c) => c.grade === grade);
  const shownTeachers = teacherOptions(teachers).filter((o) => o.label.includes(teacherFilter.trim()));

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = gradeClasses.filter((c) => classIds.has(c.id)).map((c) => c.id);
    if (chosen.length < 2) return setError("needTwoClasses");
    if (teacherIds.size > MAX_BLOCK_TEACHERS) return setError("tooManyTeachers");
    setBusy(true);
    const failure = await onSave({ subjectId, weeklyPeriods: periods, classIds: chosen, teacherIds: [...teacherIds] });
    setBusy(false);
    setError(failure);
  }

  return (
    <form onSubmit={submit} aria-label={block ? t("plata.edit") : t("plata.new")}
      className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("plata.grade")}</span>
          <select value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassIds(new Set()); }}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-2">
            {grades.map((g) => <option key={g} value={g}>{label(g)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("plata.subject")}</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-2">
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("plata.periods")}</span>
          <input type="number" min={1} max={MAX_WEEKLY_PERIODS} value={periods}
            onChange={(e) => setPeriods(Number(e.target.value))}
            className="h-9 w-20 rounded-lg border border-neutral-300 px-2 text-center tabular-nums" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("plata.classes")}</legend>
        <div className="flex flex-wrap gap-3">
          {gradeClasses.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={classIds.has(c.id)} onChange={() => setClassIds((s) => toggle(s, c.id))}
                className="size-4 accent-violet-600" />
              {className(c.grade, c.number, label)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("plata.teachers")}</legend>
        <input type="search" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}
          aria-label={t("plata.filterTeachers")} placeholder={t("plata.filterTeachers")}
          className="mb-2 h-8 w-64 rounded-lg border border-neutral-300 px-2 text-sm" />
        <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 sm:grid-cols-3">
          {shownTeachers.map((o) => (
            <label key={o.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={teacherIds.has(o.id)} onChange={() => setTeacherIds((s) => toggle(s, o.id))}
                className="size-4 accent-violet-600" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error === "needTwoClasses" || error === "tooManyTeachers"
            ? t(`plata.${error}`, { max: MAX_BLOCK_TEACHERS })
            : t(`errors.${error}`)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !subjectId}>{t("plata.save")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </form>
  );
}
