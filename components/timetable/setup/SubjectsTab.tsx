"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TtSubject } from "@/lib/timetable/subjects";
import { MAX_GRADE, MAX_NAME_LENGTH, MIN_GRADE } from "@/lib/validations/timetable";
import { cn } from "@/lib/utils";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { PasteNamesDialog } from "./PasteNamesDialog";

const GRADES = Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => MIN_GRADE + i);

/** The board's subjects with inline rename, group grades and delete, plus adding one or pasting a list. */
export function SubjectsTab({ boardId, subjects }: { boardId: string; subjects: TtSubject[] }) {
  const t = useTranslations("timetable.setup");
  const router = useRouter();
  const [error, setError] = useState<SetupErrorKey | null>(null);

  const [draft, setDraft] = useState("");

  async function addOne(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    const res = await api.addSubjects(boardId, [name]);
    if (!res.ok) return setError(res.error);
    setError(null);
    setDraft("");
    router.refresh();
  }

  async function paste(names: string[]) {
    setError(null);
    const res = await api.addSubjects(boardId, names);
    if (!res.ok) {
      setError(res.error);
      throw new Error(res.error);
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">{t("subjects.count", { count: subjects.length })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={addOne} className="flex items-center gap-1">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_NAME_LENGTH}
              aria-label={t("subjects.addLabel")} placeholder={t("subjects.addPlaceholder")}
              className="h-9 w-44 rounded-lg border border-neutral-300 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
            <Button type="submit" variant="outline" size="sm" disabled={!draft.trim()}>{t("subjects.add")}</Button>
          </form>
          <PasteNamesDialog title={t("paste.open")} onSubmit={paste} />
        </div>
      </div>
      <p className="max-w-2xl text-xs text-neutral-500">{t("subjects.groupGradesHint")}</p>
      {error && <p role="alert" className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
      <ul aria-label={t("tabs.subjects")} className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
        {subjects.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">{t("subjects.empty")}</li>}
        {subjects.map((subject) => <SubjectRow key={subject.id} boardId={boardId} subject={subject} />)}
      </ul>
    </div>
  );
}

function SubjectRow({ boardId, subject }: { boardId: string; subject: TtSubject }) {
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const [name, setName] = useState(subject.name);
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function rename() {
    const next = name.trim();
    if (next.length === 0 || next === subject.name) return setName(subject.name);
    const res = await api.updateSubject(boardId, subject.id, { name: next });
    if (!res.ok) {
      setName(subject.name);
      return setError(res.error);
    }
    setError(null);
    router.refresh();
  }

  async function toggleGrade(grade: number) {
    const groupGrades = subject.groupGrades.includes(grade)
      ? subject.groupGrades.filter((g) => g !== grade)
      : [...subject.groupGrades, grade];
    const res = await api.updateSubject(boardId, subject.id, { groupGrades });
    if (!res.ok) return setError(res.error);
    setError(null);
    router.refresh();
  }

  async function remove() {
    const res = await api.deleteSubject(boardId, subject.id);
    setConfirming(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <li className="px-4 py-1.5">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <input value={name} maxLength={MAX_NAME_LENGTH} aria-label={t("subjects.rename", { name: subject.name })}
          onChange={(e) => setName(e.target.value)} onBlur={rename}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="h-8 min-w-32 flex-1 rounded-md border border-transparent px-2 text-sm hover:border-neutral-200 focus-visible:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          <span className="hidden sm:inline">{t("subjects.groupGrades")}</span>
          {GRADES.map((grade) => {
            const on = subject.groupGrades.includes(grade);
            return (
              <button key={grade} type="button" aria-pressed={on} onClick={() => toggleGrade(grade)}
                aria-label={t("subjects.groupGradeFor", { subject: subject.name, grade: tGrades(`label_${grade}`) })}
                className={cn("h-7 min-w-7 rounded-md border px-1 text-xs font-medium",
                  on ? "border-violet-600 bg-violet-600 text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")}>
                {tGrades(`label_${grade}`)}
              </button>
            );
          })}
        </span>
        {confirming ? (
          <span className="flex items-center gap-1 text-sm">
            {t("confirmDelete")}
            <Button type="button" size="sm" variant="destructive" onClick={remove}>{t("delete")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
          </span>
        ) : (
          <Button type="button" size="icon" variant="ghost" onClick={() => setConfirming(true)}
            aria-label={t("deleteNamed", { name: subject.name })}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
        )}
      </div>
      {error && <p role="alert" className="ps-2 text-sm text-red-700">{t(`errors.${error}`)}</p>}
    </li>
  );
}
