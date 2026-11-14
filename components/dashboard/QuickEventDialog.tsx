"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { EventType } from "@/components/wizard/WizardShell";
import { buildEventTimeRange } from "@/lib/events/date-range";

interface Props {
  open: boolean;
  dateIso: string | null;
  eventTypes: EventType[];
  allowedGrades: number[];
  onClose: () => void;
  onPublished: (event: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    description: string | null;
    location: string | null;
    eventTypeId: string;
    eventTypeKey: string;
    eventTypeLabelHe: string;
    eventTypeColor: string;
    eventTypeGlyph: string;
    grades: number[];
    status: "approved";
    isCanceled: false;
    isUpdated: false;
    canEdit: true;
  }) => void;
}

interface QuickEventData {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  multiDay: boolean;
  endDate: string;
  eventTypeId: string;
  grades: number[];
  responsibleText: string;
}

const EMPTY_DATA: QuickEventData = {
  title: "",
  description: "",
  date: "",
  startTime: "08:00",
  endTime: "09:00",
  allDay: false,
  multiDay: false,
  endDate: "",
  eventTypeId: "",
  grades: [],
  responsibleText: "",
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function QuickEventDialog({
  open,
  dateIso,
  eventTypes,
  allowedGrades,
  onClose,
  onPublished,
}: Props) {
  const tc = useTranslations("common");
  const tg = useTranslations("grades");
  const t1 = useTranslations("wizard.step1");
  const t2 = useTranslations("wizard.step2");
  const t3 = useTranslations("wizard.step3");
  const t4 = useTranslations("wizard.step4");
  const t5 = useTranslations("wizard.step5");
  const t6 = useTranslations("wizard.step6");
  const t7 = useTranslations("wizard.step7");
  const te = useTranslations("wizard.editor");
  const td = useTranslations("dashboard");
  const gradeOptions = Array.from(new Set(allowedGrades)).sort((a, b) => a - b);
  const [data, setData] = useState<QuickEventData>(EMPTY_DATA);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData({
      ...EMPTY_DATA,
      date: dateIso ?? new Date().toISOString().slice(0, 10),
    });
    setError("");
    setPublishing(false);
  }, [dateIso, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  const allGradesSelected =
    gradeOptions.length > 0 && gradeOptions.every((grade) => data.grades.includes(grade));

  function patch(patchData: Partial<QuickEventData>) {
    setData((current) => ({ ...current, ...patchData }));
    setError("");
  }

  function validate(): string {
    if (!data.title.trim()) return t4("errorRequired");
    if (!data.date) return t1("errorRequired");
    if (!data.eventTypeId) return t3("errorRequired");
    if (data.grades.length === 0) return t2("errorRequired");
    if (!data.allDay && (!TIME_RE.test(data.startTime) || !TIME_RE.test(data.endTime))) {
      return t5("errorInvalid");
    }
    if (!data.allDay && data.startTime >= data.endTime) return t5("errorInverted");
    if (data.multiDay && data.endDate < data.date) return t5("errorEndBeforeStart");
    return "";
  }

  async function publish() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const allDay = data.multiDay || data.allDay;
    const { startAt, endAt } = buildEventTimeRange({
      startDate: data.date,
      endDate: data.multiDay ? data.endDate : undefined,
      allDay,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    setPublishing(true);
    try {
      const publishRes = await fetch("/api/v1/events/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title.trim(),
          description: data.description.trim() || undefined,
          location: data.responsibleText.trim() || undefined,
          eventTypeId: data.eventTypeId,
          grades: data.grades,
          startAt,
          endAt,
          allDay,
        }),
      });
      if (!publishRes.ok) throw new Error("Failed to publish event");

      const created = (await publishRes.json()) as { id: string };
      const selectedType = eventTypes.find((type) => type.id === data.eventTypeId);
      if (selectedType) {
        onPublished({
          id: created.id,
          title: data.title.trim(),
          startAt,
          endAt,
          allDay,
          description: data.description.trim() || null,
          location: data.responsibleText.trim() || null,
          eventTypeId: selectedType.id,
          eventTypeKey: selectedType.key,
          eventTypeLabelHe: selectedType.labelHe,
          eventTypeColor: selectedType.colorHex,
          eventTypeGlyph: selectedType.glyph,
          grades: data.grades,
          status: "approved",
          isCanceled: false,
          isUpdated: false,
          canEdit: true,
        });
      }
      onClose();
    } catch {
      setError(t7("submitError"));
      setPublishing(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-event-title"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-3 py-3 sm:py-20"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="sg-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl sm:max-h-[calc(100dvh-10rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--sg-hairline)] px-5 py-4">
          <h2 id="quick-event-title" className="text-xl font-semibold text-[var(--sg-ink)]">
            {td("newEvent")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc("cancel")}
            className="grid size-8 place-items-center rounded-full text-[var(--sg-ink-soft)] hover:bg-[var(--sg-surface-2)]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <Field label={t4("title")}>
            <input
              type="text"
              value={data.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={te("titlePlaceholder")}
              aria-label={t4("title")}
              className="h-11 w-full rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-base outline-none focus:border-sky-400 focus:bg-white"
              autoFocus
            />
          </Field>

          <Field label={te("detailsLabel")}>
            <textarea
              value={data.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder={te("detailsPlaceholder")}
              aria-label={te("detailsLabel")}
              rows={3}
              className="w-full resize-y rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 py-2 text-sm outline-none focus:border-sky-400 focus:bg-white"
            />
          </Field>

          <div className="grid gap-3">
            <Field label={t1("title")}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  value={data.date}
                  onChange={(e) => {
                    const date = e.target.value;
                    patch({
                      date,
                      endDate: data.multiDay && data.endDate < date ? date : data.endDate,
                    });
                  }}
                  aria-label={t1("title")}
                  className="h-10 w-full min-w-0 appearance-none rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-sm outline-none focus:border-sky-400"
                />
                {data.multiDay && (
                  <input
                    type="date"
                    value={data.endDate}
                    min={data.date}
                    onChange={(e) => patch({ endDate: e.target.value })}
                    aria-label={t5("endDate")}
                    className="h-10 w-full min-w-0 appearance-none rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-sm outline-none focus:border-sky-400"
                  />
                )}
              </div>
            </Field>
            <Field label={t5("title")}>
              <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(5rem,1fr)_minmax(5rem,1fr)_auto_auto]">
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--sg-ink-soft)]">
                    {t5("startLabel")}
                  </span>
                  <TimeWheelInput
                    value={data.startTime}
                    disabled={data.allDay}
                    label={t5("startLabel")}
                    onChange={(startTime) => patch({ startTime })}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--sg-ink-soft)]">
                    {t5("endLabel")}
                  </span>
                  <TimeWheelInput
                    value={data.endTime}
                    disabled={data.allDay}
                    label={t5("endLabel")}
                    onChange={(endTime) => patch({ endTime })}
                  />
                </label>
                <label className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-2 text-xs">
                  <input
                    type="checkbox"
                    checked={data.allDay}
                    disabled={data.multiDay}
                    onChange={(e) => patch({ allDay: e.target.checked })}
                  />
                  <span className="whitespace-nowrap">{t5("allDay")}</span>
                </label>
                <label className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-2 text-xs">
                  <input
                    type="checkbox"
                    checked={data.multiDay}
                    onChange={(e) =>
                      patch({
                        multiDay: e.target.checked,
                        allDay: e.target.checked || data.allDay,
                        endDate: e.target.checked ? data.date : data.endDate,
                      })
                    }
                  />
                  <span className="whitespace-nowrap">{t5("multiDay")}</span>
                </label>
              </div>
            </Field>
          </div>

          <Field label={t3("title")}>
            <select
              value={data.eventTypeId}
              onChange={(e) => patch({ eventTypeId: e.target.value })}
              aria-label={t3("title")}
              className="h-10 w-full rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-sm outline-none focus:border-sky-400 focus:bg-white"
            >
              <option value="">{te("selectType")}</option>
              {eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.glyph} {type.labelHe}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t2("title")}>
            {gradeOptions.length > 1 && (
              <button
                type="button"
                aria-pressed={allGradesSelected}
                onClick={() => patch({ grades: allGradesSelected ? [] : gradeOptions })}
                className="mb-2 min-h-9 rounded-full border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100"
              >
                {allGradesSelected ? t2("clearAll") : t2("selectAll")}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {gradeOptions.map((grade) => {
                const active = data.grades.includes(grade);
                return (
                  <button
                    key={grade}
                    type="button"
                    data-grade={grade}
                    aria-pressed={active}
                    onClick={() =>
                      patch({
                        grades: active
                          ? data.grades.filter((g) => g !== grade)
                          : [...data.grades, grade],
                      })
                    }
                    className={`min-h-9 min-w-10 rounded-full border px-3 text-sm font-medium ${
                      active
                        ? "border-[var(--sg-ink)] bg-[var(--sg-ink)] text-white"
                        : "border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] text-[var(--sg-ink)] hover:border-sky-300"
                    }`}
                  >
                    {tg(`label_${grade}` as `label_${7 | 8 | 9 | 10 | 11 | 12}`)}
                  </button>
                );
              })}
            </div>
          </Field>

          <details className="rounded-xl bg-[var(--sg-surface-2)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-[var(--sg-ink-mute)]">
              {te("moreOptions")}
            </summary>
            <input
              type="text"
              value={data.responsibleText}
              onChange={(e) => patch({ responsibleText: e.target.value })}
              placeholder={te("responsiblePlaceholder")}
              aria-label={t6("title")}
              className="mt-3 h-10 w-full rounded-xl border border-[var(--sg-hairline)] bg-white px-3 text-sm outline-none focus:border-sky-400"
            />
          </details>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--sg-hairline)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-[var(--sg-hairline)] bg-white px-4 text-sm font-medium text-[var(--sg-ink-mute)] hover:bg-[var(--sg-surface-2)]"
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={publishing}
            className="sg-button-primary h-10 rounded-xl px-5 text-sm font-bold disabled:opacity-50"
          >
            {publishing ? t7("submitting") : t7("submit")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-[var(--sg-ink-soft)] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function TimeWheelInput({
  value,
  label,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hour = "08", minute = "00"] = value.split(":");

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commitManual() {
    const normalized = normalizeTime(draft);
    setDraft(normalized ?? value);
    if (normalized) onChange(normalized);
  }

  function pick(nextHour: string, nextMinute: string) {
    const next = `${nextHour}:${nextMinute}`;
    setDraft(next);
    onChange(next);
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          commitManual();
        }
      }}
    >
      <input
        type="text"
        dir="ltr"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d:]/g, "").slice(0, 5);
          setDraft(next);
          if (TIME_RE.test(next)) onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-label={label}
        placeholder="HH:MM"
        className="h-10 w-full min-w-0 rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-2 text-center text-sm outline-none focus:border-sky-400 focus:bg-white disabled:opacity-45"
      />

      {open && !disabled && (
        <div
          dir="ltr"
          className="absolute top-full right-0 z-20 mt-2 grid w-40 grid-cols-2 overflow-hidden rounded-xl border border-[var(--sg-hairline)] bg-white shadow-xl"
        >
          <WheelColumn
            values={HOURS}
            selected={hour}
            onPick={(nextHour) => pick(nextHour, minute)}
          />
          <WheelColumn
            values={MINUTES}
            selected={minute}
            onPick={(nextMinute) => pick(hour, nextMinute)}
          />
        </div>
      )}
    </div>
  );
}

function WheelColumn({
  values,
  selected,
  onPick,
}: {
  values: string[];
  selected: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="max-h-40 overflow-y-auto py-1">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          tabIndex={0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(value)}
          className={`block h-8 w-full text-center text-sm ${
            value === selected
              ? "bg-sky-100 font-bold text-sky-700"
              : "text-[var(--sg-ink)] hover:bg-[var(--sg-surface-2)]"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function normalizeTime(value: string): string | null {
  if (TIME_RE.test(value)) return value;

  const compact = value.replace(/\D/g, "");
  if (compact.length === 3) {
    const hour = compact.slice(0, 1).padStart(2, "0");
    const minute = compact.slice(1);
    const normalized = `${hour}:${minute}`;
    return TIME_RE.test(normalized) ? normalized : null;
  }
  if (compact.length === 4) {
    const normalized = `${compact.slice(0, 2)}:${compact.slice(2)}`;
    return TIME_RE.test(normalized) ? normalized : null;
  }

  return null;
}
