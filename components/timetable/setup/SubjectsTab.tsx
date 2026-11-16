"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TtSubject } from "@/lib/timetable/subjects";
import { MAX_NAME_LENGTH } from "@/lib/validations/timetable";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { PasteNamesDialog } from "./PasteNamesDialog";

/** The board's subjects with inline rename and delete, plus pasting a list. */
export function SubjectsTab({ boardId, subjects }: { boardId: string; subjects: TtSubject[] }) {
  const t = useTranslations("timetable.setup");
  const router = useRouter();
  const [error, setError] = useState<SetupErrorKey | null>(null);

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
        <PasteNamesDialog title={t("paste.open")} onSubmit={paste} />
      </div>
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
  const router = useRouter();
  const [name, setName] = useState(subject.name);
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function rename() {
    const next = name.trim();
    if (next.length === 0 || next === subject.name) return setName(subject.name);
    const res = await api.renameSubject(boardId, subject.id, next);
    if (!res.ok) {
      setName(subject.name);
      return setError(res.error);
    }
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
      <div className="flex min-h-9 items-center gap-2">
        <input value={name} maxLength={MAX_NAME_LENGTH} aria-label={t("subjects.rename", { name: subject.name })}
          onChange={(e) => setName(e.target.value)} onBlur={rename}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent px-2 text-sm hover:border-neutral-200 focus-visible:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
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
