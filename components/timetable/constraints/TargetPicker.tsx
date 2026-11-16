"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { labelReach, type Target } from "@/lib/timetable/constraints/target";
import type { ProfileCategory } from "@/lib/validations/profile";

export interface PickerTeacher {
  id: string;
  fullName: string;
  staffUserId: string | null;
}

interface Props {
  teachers: PickerTeacher[];
  categories: ProfileCategory[];
  labels: Record<string, string[]>;
  value: Target;
  onChange: (target: Target) => void;
}

/** Aims a constraint at chosen teachers, or at everyone holding one profile option. */
export function TargetPicker({ teachers, categories, labels, value, onChange }: Props) {
  const t = useTranslations("timetable.constraints");
  const name = useId();
  const firstOption = categories.flatMap((c) => c.options)[0]?.id;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("target.title")}</legend>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name={name} checked={value.kind === "teachers"} className="accent-violet-600"
            onChange={() => onChange({ kind: "teachers", teacherIds: [] })} />
          {t("target.teachers")}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={name} checked={value.kind === "label"} disabled={!firstOption} className="accent-violet-600"
            onChange={() => firstOption && onChange({ kind: "label", optionId: firstOption })} />
          {t("target.label")}
        </label>
      </div>
      {value.kind === "teachers" ? (
        <TeacherChecklist teachers={teachers} chosen={value.teacherIds}
          onChange={(teacherIds) => onChange({ kind: "teachers", teacherIds })} />
      ) : (
        <LabelChoice teachers={teachers} categories={categories} labels={labels} optionId={value.optionId}
          onChange={(optionId) => onChange({ kind: "label", optionId })} />
      )}
    </fieldset>
  );
}

function TeacherChecklist({ teachers, chosen, onChange }: {
  teachers: PickerTeacher[];
  chosen: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("timetable.constraints");
  const [filter, setFilter] = useState("");
  const shown = teachers.filter((x) => x.fullName.includes(filter.trim()));
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return (
    <div className="space-y-2">
      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("target.search")}
        placeholder={t("target.search")} className="h-8 w-64 rounded-lg border border-neutral-300 px-2 text-sm" />
      <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 sm:grid-cols-3">
        {shown.map((x) => (
          <label key={x.id} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={chosen.includes(x.id)} onChange={() => toggle(x.id)} className="size-4 accent-violet-600" />
            <span className="truncate">{x.fullName}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-neutral-500">{t("target.chosen", { count: chosen.length })}</p>
    </div>
  );
}

function LabelChoice({ teachers, categories, labels, optionId, onChange }: {
  teachers: PickerTeacher[];
  categories: ProfileCategory[];
  labels: Record<string, string[]>;
  optionId: string;
  onChange: (optionId: string) => void;
}) {
  const t = useTranslations("timetable.constraints");
  const { reachedIds, unlinkedIds } = labelReach(optionId, teachers, labels);
  const unlinked = teachers.filter((x) => unlinkedIds.includes(x.id));
  return (
    <div className="space-y-1.5 text-sm">
      <select value={optionId} onChange={(e) => onChange(e.target.value)} aria-label={t("target.label")}
        className="h-9 rounded-lg border border-neutral-300 bg-white px-2">
        {categories.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {c.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      <p className={reachedIds.length === 0 ? "font-medium text-red-700" : "text-neutral-700"}>
        {t("target.reach", { count: reachedIds.length })}
      </p>
      {unlinked.length > 0 && (
        <details className="text-amber-900">
          <summary className="cursor-pointer">{t("target.unlinked", { count: unlinked.length })}</summary>
          <ul className="mt-1 max-h-32 list-disc overflow-y-auto ps-5 text-xs">
            {unlinked.map((x) => <li key={x.id}>{x.fullName}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
