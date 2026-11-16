"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TtConstraint } from "@/lib/timetable/constraints/crud";
import type { SkippedConstraint } from "@/lib/timetable/constraints/export";
import { CONSTRAINT_TYPES, type ConstraintInput, type ConstraintType } from "@/lib/timetable/constraints/registry";
import type { Week } from "@/lib/timetable/week";
import type { ProfileCategory } from "@/lib/validations/profile";
import * as api from "./api";
import { ConstraintForm, type FormTeacher } from "./ConstraintForm";
import { describeConstraint, type Names } from "./describe";

interface Props {
  boardId: string;
  constraints: TtConstraint[];
  skipped: SkippedConstraint[];
  teachers: FormTeacher[];
  categories: ProfileCategory[];
  labels: Record<string, string[]>;
  week: Week;
}

type Editing = { kind: "new"; type: ConstraintType } | { kind: "row"; id: string } | null;
const TYPES = Object.keys(CONSTRAINT_TYPES) as ConstraintType[];

/** The board's constraints grouped by type, with add, edit and delete. */
export function ConstraintsTab(props: Props) {
  const { boardId, constraints, skipped, teachers, categories } = props;
  const t = useTranslations("timetable.constraints");
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [newType, setNewType] = useState<ConstraintType>("meeting");
  const teacherName = new Map(teachers.map((x) => [x.id, x.fullName]));
  const optionName = new Map(categories.flatMap((c) => c.options.map((o) => [o.id, o.label] as const)));
  const names: Names = {
    teacher: (id) => teacherName.get(id) ?? t("removedTeacher"),
    option: (id) => optionName.get(id) ?? t("removedLabel"),
    day: (d) => t(`days.${d}`),
  };
  const skippedBy = new Map(skipped.map((s) => [s.constraintId, s.reason]));

  async function save(id: string | null, input: ConstraintInput) {
    const res = id ? await api.replaceConstraint(boardId, id, input) : await api.createConstraint(boardId, input);
    if (!res.ok) return res.error;
    setEditing(null);
    router.refresh();
    return null;
  }

  const form = (type: ConstraintType, initial: TtConstraint | null) => (
    <ConstraintForm type={type} initial={initial} {...props}
      onSave={(input) => save(initial?.id ?? null, input)} onCancel={() => setEditing(null)} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-neutral-600">{t("hint")}</p>
        <div className="flex items-center gap-2">
          <select value={newType} onChange={(e) => setNewType(e.target.value as ConstraintType)} aria-label={t("chooseType")}
            className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-sm">
            {TYPES.map((type) => <option key={type} value={type}>{t(`types.${type}`)}</option>)}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ kind: "new", type: newType })}>
            <Plus aria-hidden className="size-4" />
            {t("add")}
          </Button>
        </div>
      </div>
      {editing?.kind === "new" && form(editing.type, null)}
      {constraints.length === 0 && <p className="text-sm text-neutral-500">{t("empty")}</p>}
      {TYPES.filter((type) => constraints.some((c) => c.type === type)).map((type) => (
        <section key={type} aria-label={t(`types.${type}`)} className="space-y-2">
          <h2 className="text-sm font-semibold">{t(`types.${type}`)}</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {constraints.filter((c) => c.type === type).map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                {editing?.kind === "row" && editing.id === c.id ? form(c.type, c) : (
                  <Row constraint={c} text={describeConstraint(c, names, t)} skipped={skippedBy.get(c.id)}
                    onEdit={() => setEditing({ kind: "row", id: c.id })}
                    onDelete={async () => { const res = await api.deleteConstraint(boardId, c.id); if (res.ok) router.refresh(); return res.ok ? null : res.error; }} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ constraint, text, skipped, onEdit, onDelete }: {
  constraint: TtConstraint;
  text: string;
  skipped: SkippedConstraint["reason"] | undefined;
  onEdit: () => void;
  onDelete: () => Promise<api.ConstraintErrorKey | null>;
}) {
  const t = useTranslations("timetable.constraints");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<api.ConstraintErrorKey | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 flex-1 text-sm">{text}</span>
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
        {constraint.hard ? t("hard") : t("softWeight", { weight: constraint.weight })}
      </span>
      {constraint.source === "teacher" && <span className="text-xs text-neutral-500">{t("fromTeacher")}</span>}
      {confirming ? (
        <span className="flex items-center gap-1 text-sm">
          <Button type="button" size="sm" variant="destructive"
            onClick={async () => { setError(await onDelete()); setConfirming(false); }}>{t("delete")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
        </span>
      ) : (
        <span className="flex items-center">
          <Button type="button" size="icon" variant="ghost" aria-label={t("edit")} onClick={onEdit}>
            <Pencil aria-hidden className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label={t("delete")} onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </span>
      )}
      {skipped && <p className="w-full text-xs font-medium text-amber-800">{t(`skipped.${skipped}`)}</p>}
      {error && <p role="alert" className="w-full text-xs text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}
