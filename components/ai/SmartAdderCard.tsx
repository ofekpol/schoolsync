"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, TriangleAlert } from "lucide-react";
import type { EventType } from "@/lib/events/event-type";
import { currentWarnings, isCandidateComplete } from "@/lib/ai/adder/complete";
import type { AdderWarning, CandidateEvent } from "@/lib/ai/adder/types";
import { cn } from "@/lib/utils";
import { SmartAdderCardEditor } from "./SmartAdderCardEditor";
import { existingEventHref, formatDayMonth, formatIsoDate, formatTimeRange } from "./adder-format";

interface Props {
  candidate: CandidateEvent;
  eventTypes: EventType[];
  allowedGrades: number[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onChange: (next: CandidateEvent) => void;
  /** Publish error for this card, already translated. */
  error?: string;
}

function WarningLine({ warning }: { warning: AdderWarning }) {
  const t = useTranslations("aiAdder");
  const tg = useTranslations("grades");
  const grades = (list: number[]) => list.map((g) => tg(`label_${g}`)).join(", ");
  let text: string;
  if (warning.code === "grade_out_of_scope") {
    text = t("warnings.grade_out_of_scope", { grades: grades(warning.grades) });
  } else if (warning.code === "duplicate") {
    text = t("warnings.duplicate", { title: warning.title, date: formatIsoDate(warning.date) });
  } else if (warning.code === "overlap") {
    const time = formatTimeRange(warning.startAt, warning.endAt);
    text = t("warnings.overlap", { title: warning.title, grades: grades(warning.grades), time });
  } else {
    text = t(`warnings.${warning.code}`);
  }
  return (
    <li className="flex items-start gap-1.5 text-xs text-amber-800">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
      {warning.code === "duplicate" && (
        <a href={existingEventHref(warning.date, warning.eventId)} className="whitespace-nowrap underline">
          {t("openExisting")}
        </a>
      )}
    </li>
  );
}

function Summary({ candidate, eventTypes, allowedGrades }: Pick<Props, "candidate" | "eventTypes" | "allowedGrades">) {
  const t = useTranslations("aiAdder");
  const tg = useTranslations("grades");
  const type = eventTypes.find((et) => et.id === candidate.eventTypeId);
  const date = candidate.startDate
    ? formatIsoDate(candidate.startDate) + (candidate.endDate ? `–${formatIsoDate(candidate.endDate)}` : "")
    : candidate.dateHint
      ? t("dateHint", { date: formatDayMonth(candidate.dateHint.day, candidate.dateHint.month) })
      : t("noDate");
  const time =
    candidate.allDay === true
      ? t("fields.allDay")
      : [candidate.startTime, candidate.endTime].filter(Boolean).join("–") || t("noTime");
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
      {type && (
        <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: type.colorHex }}>
          {type.glyph} {type.labelHe}
        </span>
      )}
      <span>{date}</span>
      <span aria-hidden="true">·</span>
      <span>{time}</span>
      {candidate.grades.map((grade) => {
        const outOfScope = !allowedGrades.includes(grade);
        return (
          <span
            key={grade}
            data-out-of-scope={outOfScope ? "true" : undefined}
            className={cn("rounded-md border border-[var(--sg-hairline)] px-1.5 text-xs", outOfScope && "line-through opacity-60")}
          >
            {tg(`label_${grade}`)}
          </span>
        );
      })}
    </div>
  );
}

/** One detected event in the smart adder review list. */
export function SmartAdderCard(props: Props) {
  const { candidate, allowedGrades, checked, onCheckedChange, onChange, error } = props;
  const t = useTranslations("aiAdder");
  const [editing, setEditing] = useState(false);
  const warnings = currentWarnings(candidate, allowedGrades);
  const complete = isCandidateComplete(candidate, allowedGrades);
  const title = candidate.title.trim() || t("untitled");

  return (
    <article
      data-testid={`adder-card-${candidate.clientId}`}
      className={cn(
        "rounded-xl border bg-white p-3",
        warnings.length > 0 ? "border-amber-400 bg-amber-50" : "border-[var(--sg-hairline)]",
        editing && "border-sky-500 ring-2 ring-sky-100",
      )}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          checked={checked && complete}
          disabled={!complete}
          aria-label={t("include", { title })}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <h3 className="font-semibold">{title}</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ms-auto flex items-center gap-1 rounded-md border border-[var(--sg-hairline)] bg-white px-2 py-0.5 text-xs"
          >
            <Pencil className="size-3" aria-hidden="true" />
            {t("edit")}
          </button>
        )}
      </div>
      {!editing && <Summary {...props} />}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {warnings.map((w, i) => (
            <WarningLine key={`${w.code}-${i}`} warning={w} />
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {editing && (
        <SmartAdderCardEditor
          candidate={candidate}
          eventTypes={props.eventTypes}
          allowedGrades={allowedGrades}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            setEditing(false);
            onChange(next);
          }}
        />
      )}
    </article>
  );
}
