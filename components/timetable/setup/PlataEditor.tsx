"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TtBlock } from "@/lib/timetable/blocks";
import type { TtClass } from "@/lib/timetable/classes";
import type { TtSubject } from "@/lib/timetable/subjects";
import type { BlockInput } from "@/lib/validations/timetable";
import { MAX_CLASSES_PER_GRADE, MAX_NAME_LENGTH, MAX_WEEKLY_PERIODS } from "@/lib/validations/timetable";
import type { SetupErrorKey } from "./api";
import { className } from "./className";
import { groupSubjects, teacherOptions } from "./lessons-grid";

/** BlockInputSchema caps a block's teachers at MAX_CLASSES_PER_GRADE. */
const MAX_BLOCK_TEACHERS = MAX_CLASSES_PER_GRADE;

interface Props {
  block: TtBlock | null;
  classes: TtClass[];
  subjects: TtSubject[];
  teachers: Array<{ id: string; fullName: string }>;
  /** Teacher ids whose profile lists the subject (checked when the subject is picked). */
  teachersFor: (subjectName: string) => string[];
  onSave: (input: BlockInput) => Promise<SetupErrorKey | null>;
  onCancel: () => void;
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Form for a cluster: grade, a subject taught in groups there, weekly periods, classes (2+), teachers and group names. */
export function PlataEditor({ block, classes, subjects, teachers, teachersFor, onSave, onCancel }: Props) {
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const grades = [...new Set(classes.map((c) => c.grade))];
  const firstClass = classes.find((c) => c.id === block?.classIds[0]);
  const [grade, setGrade] = useState(firstClass?.grade ?? grades[0] ?? 7);
  const offered = groupSubjects(subjects, grade, block?.subjectId);
  const [subjectId, setSubjectId] = useState(block?.subjectId ?? offered[0]?.id ?? "");
  const [periods, setPeriods] = useState(block?.weeklyPeriods ?? 1);
  const [classIds, setClassIds] = useState(new Set(block?.classIds ?? []));
  const [teacherIds, setTeacherIds] = useState(() =>
    new Set(block?.teacherIds ?? teachersFor(offered[0]?.name ?? "")));
  const [groupNames, setGroupNames] = useState<Record<string, string>>(block?.groupNames ?? {});
  const [autoPicked, setAutoPicked] = useState(!block && teacherIds.size > 0);
  const [error, setError] = useState<SetupErrorKey | "needTwoClasses" | "tooManyTeachers" | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (g: number) => tGrades(`label_${g}`);
  const gradeClasses = classes.filter((c) => c.grade === grade);

  function pickSubject(id: string) {
    setSubjectId(id);
    const picked = teachersFor(subjects.find((s) => s.id === id)?.name ?? "");
    setTeacherIds(new Set(picked));
    setAutoPicked(picked.length > 0);
  }

  function pickGrade(next: number) {
    setGrade(next);
    setClassIds(new Set());
    const keep = groupSubjects(subjects, next, block?.subjectId).some((s) => s.id === subjectId);
    if (!keep) pickSubject(groupSubjects(subjects, next, block?.subjectId)[0]?.id ?? "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = gradeClasses.filter((c) => classIds.has(c.id)).map((c) => c.id);
    if (chosen.length < 2) return setError("needTwoClasses");
    if (teacherIds.size > MAX_BLOCK_TEACHERS) return setError("tooManyTeachers");
    const ids = [...teacherIds];
    const names = Object.fromEntries(ids.flatMap((id) => (groupNames[id]?.trim() ? [[id, groupNames[id].trim()]] : [])));
    setBusy(true);
    const failure = await onSave({ subjectId, weeklyPeriods: periods, classIds: chosen, teacherIds: ids, groupNames: names });
    setBusy(false);
    setError(failure);
  }

  return (
    <form onSubmit={submit} aria-label={block ? t("plata.edit") : t("plata.new")}
      className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("plata.grade")}</span>
          <select value={grade} onChange={(e) => pickGrade(Number(e.target.value))}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-2">
            {grades.map((g) => <option key={g} value={g}>{label(g)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("plata.subject")}</span>
          <select value={subjectId} onChange={(e) => pickSubject(e.target.value)} disabled={offered.length === 0}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-2">
            {offered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("plata.periods")}</span>
          <input type="number" min={1} max={MAX_WEEKLY_PERIODS} value={periods}
            onChange={(e) => setPeriods(Number(e.target.value))}
            className="h-9 w-20 rounded-lg border border-neutral-300 px-2 text-center tabular-nums" />
        </label>
      </div>
      {offered.length === 0 && <p className="text-sm text-amber-800">{t("plata.noGroupSubjects")}</p>}
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t("plata.classes")}</legend>
        <div className="flex flex-wrap gap-3">
          {gradeClasses.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={classIds.has(c.id)} onChange={() => setClassIds((s) => toggle(s, c.id))}
                className="size-4 accent-violet-600" />
              {className(c, label)}
              {c.kind && <span className="text-xs text-neutral-500">({c.kind})</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <GroupsFieldset teachers={teachers} chosen={teacherIds} names={groupNames} autoPicked={autoPicked}
        onToggle={(id) => setTeacherIds((s) => toggle(s, id))}
        onName={(id, name) => setGroupNames((all) => ({ ...all, [id]: name }))} />
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

interface GroupsProps {
  teachers: Array<{ id: string; fullName: string }>;
  chosen: Set<string>;
  names: Record<string, string>;
  autoPicked: boolean;
  onToggle: (id: string) => void;
  onName: (id: string, name: string) => void;
}

/** Teacher checkboxes (searchable), then a group-name field for each checked teacher. */
function GroupsFieldset({ teachers, chosen, names, autoPicked, onToggle, onName }: GroupsProps) {
  const t = useTranslations("timetable.setup");
  const [filter, setFilter] = useState("");
  const options = teacherOptions(teachers);
  const shown = options.filter((o) => o.label.includes(filter.trim()));
  const picked = options.filter((o) => chosen.has(o.id));
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{t("plata.teachers")}</legend>
      {autoPicked && <p className="mb-1 text-xs text-violet-700">{t("plata.autoPicked")}</p>}
      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
        aria-label={t("plata.filterTeachers")} placeholder={t("plata.filterTeachers")}
        className="mb-2 h-8 w-64 rounded-lg border border-neutral-300 px-2 text-sm" />
      <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 sm:grid-cols-3">
        {shown.map((o) => (
          <label key={o.id} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={chosen.has(o.id)} onChange={() => onToggle(o.id)}
              className="size-4 accent-violet-600" />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
      {picked.length > 0 && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {picked.map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate">{o.label}</span>
              <input value={names[o.id] ?? ""} maxLength={MAX_NAME_LENGTH} onChange={(e) => onName(o.id, e.target.value)}
                aria-label={t("plata.groupName", { teacher: o.label })} placeholder={t("plata.groupPlaceholder")}
                className="h-8 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2" />
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
