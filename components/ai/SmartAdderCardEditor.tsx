"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { EventType } from "@/lib/events/event-type";
import type { CandidateEvent } from "@/lib/ai/adder/types";
import { formatDayMonth } from "./adder-format";
import { SCHOOL_GRADES } from "@/lib/grades";

const GRADES: number[] = [...SCHOOL_GRADES];

const INPUT =
  "h-10 w-full rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-sm outline-none focus:border-sky-400 focus:bg-white";

interface Props {
  candidate: CandidateEvent;
  eventTypes: EventType[];
  allowedGrades: number[];
  onSave: (next: CandidateEvent) => void;
  onCancel: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-[var(--sg-ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

function GradeToggles({
  value,
  allowedGrades,
  onChange,
}: {
  value: number[];
  allowedGrades: number[];
  onChange: (grades: number[]) => void;
}) {
  const tg = useTranslations("grades");
  const options = GRADES.filter((g) => allowedGrades.includes(g) || value.includes(g));
  function toggle(grade: number) {
    const next = value.includes(grade) ? value.filter((g) => g !== grade) : [...value, grade];
    onChange(next.sort((a, b) => a - b));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((grade) => {
        const on = value.includes(grade);
        const outOfScope = !allowedGrades.includes(grade);
        return (
          <button
            key={grade}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(grade)}
            className={`min-w-9 rounded-lg border px-2 py-1 text-sm ${
              on ? "border-sky-600 bg-sky-600 text-white" : "border-[var(--sg-hairline)]"
            } ${outOfScope ? "line-through opacity-60" : ""}`}
          >
            {tg(`label_${grade}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Inline edit form for one detected event. Works on a local copy until saved. */
export function SmartAdderCardEditor({ candidate, eventTypes, allowedGrades, onSave, onCancel }: Props) {
  const t = useTranslations("aiAdder");
  const [draft, setDraft] = useState<CandidateEvent>(candidate);
  const multiDay = draft.endDate !== null;
  const patch = (p: Partial<CandidateEvent>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="mt-3 grid gap-3">
      <Field label={t("fields.title")}>
        <input className={INPUT} aria-label={t("fields.title")} value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <Field label={t("fields.type")}>
        <select className={INPUT} aria-label={t("fields.type")} value={draft.eventTypeId ?? ""} onChange={(e) => patch({ eventTypeId: e.target.value || null })}>
          <option value="">{t("fields.chooseType")}</option>
          {eventTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.labelHe}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("fields.date")}>
          <input type="date" className={INPUT} aria-label={t("fields.date")} value={draft.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value || null })} />
          {draft.dateHint && !draft.startDate && (
            <span className="mt-1 block text-xs text-amber-700">
              {t("dateHint", { date: formatDayMonth(draft.dateHint.day, draft.dateHint.month) })}
            </span>
          )}
        </Field>
        {multiDay && (
          <Field label={t("fields.endDate")}>
            <input type="date" className={INPUT} aria-label={t("fields.endDate")} min={draft.startDate ?? undefined} value={draft.endDate ?? ""} onChange={(e) => patch({ endDate: e.target.value || draft.startDate })} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
        <Field label={t("fields.startTime")}>
          <input type="time" className={INPUT} aria-label={t("fields.startTime")} disabled={draft.allDay === true} value={draft.startTime ?? ""} onChange={(e) => patch({ startTime: e.target.value || null })} />
        </Field>
        <Field label={t("fields.endTime")}>
          <input type="time" className={INPUT} aria-label={t("fields.endTime")} disabled={draft.allDay === true} value={draft.endTime ?? ""} onChange={(e) => patch({ endTime: e.target.value || null })} />
        </Field>
        <label className="flex h-10 items-center gap-1.5 text-sm">
          <input type="checkbox" checked={draft.allDay === true} onChange={(e) => patch({ allDay: e.target.checked ? true : null })} />
          {t("fields.allDay")}
        </label>
        <label className="flex h-10 items-center gap-1.5 text-sm">
          <input type="checkbox" checked={multiDay} onChange={(e) => patch({ endDate: e.target.checked ? draft.startDate ?? "" : null })} />
          {t("fields.multiDay")}
        </label>
      </div>
      <div role="group" aria-label={t("fields.grades")}>
        <span className="mb-1 block text-xs font-semibold text-[var(--sg-ink-soft)]">{t("fields.grades")}</span>
        <GradeToggles value={draft.grades} allowedGrades={allowedGrades} onChange={(grades) => patch({ grades })} />
      </div>
      <Field label={t("fields.location")}>
        <input className={INPUT} aria-label={t("fields.location")} placeholder={t("fields.optional")} value={draft.location} onChange={(e) => patch({ location: e.target.value })} />
      </Field>
      <Field label={t("fields.description")}>
        <textarea rows={2} className={`${INPUT} h-auto py-2`} aria-label={t("fields.description")} placeholder={t("fields.optional")} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--sg-hairline)] px-3 py-1.5 text-sm">
          {t("cancelEdit")}
        </button>
        <button type="button" onClick={() => onSave(draft)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white">
          {t("save")}
        </button>
      </div>
    </div>
  );
}
