"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TtBlock } from "@/lib/timetable/blocks";
import type { TtClass } from "@/lib/timetable/classes";
import type { TtSubject } from "@/lib/timetable/subjects";
import type { TtTeacher } from "@/lib/timetable/teachers";
import type { BlockInput } from "@/lib/validations/timetable";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { className } from "./className";
import { teachersForSubject } from "./lessons-grid";
import { PlataEditor } from "./PlataEditor";

interface Props {
  boardId: string;
  classes: TtClass[];
  subjects: TtSubject[];
  blocks: TtBlock[];
  teachers: TtTeacher[];
  /** Every profile option of the school, and each staff user's option ids (to match teachers to a subject). */
  options: Array<{ id: string; label: string }>;
  labels: Record<string, string[]>;
}

type Editing = { kind: "new" } | { kind: "block"; id: string } | null;

/** The board's clusters (blocks with two or more classes), grouped by grade, with add, edit and delete. */
export function PlataTab({ boardId, classes, subjects, blocks, teachers, options, labels }: Props) {
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [rowError, setRowError] = useState<{ id: string; key: SetupErrorKey } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherName = new Map(teachers.map((x) => [x.id, x.fullName]));
  const label = (g: number) => tGrades(`label_${g}`);
  const plata = blocks.filter((b) => b.classIds.length > 1);
  const gradeOf = (b: TtBlock) => classById.get(b.classIds[0])?.grade ?? 0;
  const grades = [...new Set(plata.map(gradeOf))].sort((a, b) => a - b);
  const names = (b: TtBlock) =>
    b.classIds.flatMap((id) => { const c = classById.get(id); return c ? [className(c, label)] : []; }).join(", ");

  async function save(id: string | null, input: BlockInput): Promise<SetupErrorKey | null> {
    const res = id ? await api.replaceBlock(boardId, id, input) : await api.createBlock(boardId, input);
    if (!res.ok) return res.error;
    setEditing(null);
    router.refresh();
    return null;
  }

  async function remove(id: string) {
    setConfirming(null);
    const res = await api.deleteBlock(boardId, id);
    if (!res.ok) return setRowError({ id, key: res.error });
    router.refresh();
  }

  const editor = (block: TtBlock | null) => (
    <PlataEditor block={block} classes={classes} subjects={subjects} teachers={teachers}
      teachersFor={(name) => teachersForSubject(name, teachers, options, labels)}
      onSave={(input) => save(block?.id ?? null, input)} onCancel={() => setEditing(null)} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-neutral-600">{t("plata.hint")}</p>
        {editing?.kind !== "new" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ kind: "new" })}
            disabled={classes.length === 0 || subjects.length === 0}>
            <Plus aria-hidden className="size-4" />
            {t("plata.new")}
          </Button>
        )}
      </div>
      {editing?.kind === "new" && editor(null)}
      {plata.length === 0 && <p className="text-sm text-neutral-500">{t("plata.empty")}</p>}
      {grades.map((grade) => (
        <section key={grade} aria-label={t("lessons.gradeOption", { grade: label(grade) })} className="space-y-2">
          <h2 className="text-sm font-semibold">{t("lessons.gradeOption", { grade: label(grade) })}</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {plata.filter((b) => gradeOf(b) === grade).map((b) => (
              <li key={b.id} className="px-4 py-2.5">
                {editing?.kind === "block" && editing.id === b.id ? editor(b) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">{subjectName.get(b.subjectId)}</span>
                    <span className="text-sm text-neutral-600">{t("plata.summary", { periods: b.weeklyPeriods, classes: names(b) })}</span>
                    <span className="flex-1 truncate text-sm text-neutral-500">
                      {b.teacherIds
                        .map((id) => (b.groupNames[id] ? `${b.groupNames[id]}: ${teacherName.get(id)}` : teacherName.get(id)))
                        .join(" · ") || t("lessons.noTeacher")}
                    </span>
                    <Button type="button" size="icon" variant="ghost" aria-label={t("plata.edit")}
                      onClick={() => setEditing({ kind: "block", id: b.id })}>
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                    {confirming === b.id ? (
                      <span className="flex items-center gap-1">
                        <Button type="button" size="sm" variant="destructive" onClick={() => remove(b.id)}>{t("delete")}</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>{t("cancel")}</Button>
                      </span>
                    ) : (
                      <Button type="button" size="icon" variant="ghost" onClick={() => setConfirming(b.id)}
                        aria-label={t("deleteNamed", { name: subjectName.get(b.subjectId) ?? "" })}>
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    )}
                    {rowError?.id === b.id && <p role="alert" className="w-full text-sm text-red-700">{t(`errors.${rowError.key}`)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
