"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { buildEventTimeRange } from "@/lib/events/date-range";
import { jerusalemWallClockToIso } from "@/lib/datetime";

export interface EventType {
  id: string;
  key: string;
  labelHe: string;
  colorHex: string;
  glyph: string;
}

export interface WizardShellProps {
  eventTypes: EventType[];
  allowedGrades: number[];
  resumeDraft: Record<string, unknown> | null;
  resumeId: string | null;
  initialDate?: string | null;
}

export interface WizardData {
  date?: string;
  grades?: number[];
  eventTypeId?: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  multiDay?: boolean;
  endDate?: string;
  responsibleText?: string;
  requirementsText?: string;
}

/**
 * Maps wizard state to the EventDraftSchema PATCH body. The form tracks the
 * responsible/requirements fields as responsibleText/requirementsText, but they persist to the
 * `location`/`description` columns — without this mapping Zod silently drops
 * the unknown keys and the data is lost on save. `date` is a wizard-only field
 * (the canonical timestamp is startAt/endAt) and is intentionally omitted.
 */
function toApiBody(d: WizardData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (d.title !== undefined) body.title = d.title;
  if (d.eventTypeId !== undefined) body.eventTypeId = d.eventTypeId;
  if (d.grades !== undefined) body.grades = d.grades;
  if (d.startAt !== undefined) body.startAt = d.startAt;
  if (d.endAt !== undefined) body.endAt = d.endAt;
  if (d.allDay !== undefined) body.allDay = d.allDay;
  if (d.responsibleText !== undefined) body.location = d.responsibleText;
  if (d.requirementsText !== undefined) body.description = d.requirementsText;
  return body;
}

export function WizardShell({
  eventTypes,
  allowedGrades,
  resumeDraft,
  resumeId,
  initialDate,
}: WizardShellProps) {
  const router = useRouter();
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
  const [eventId, setEventId] = useState<string | null>(resumeId);
  const [data, setData] = useState<WizardData>(() => {
    if (!resumeDraft) return initialDate ? { date: initialDate } : {};
    // startAt is serialized as Jerusalem wall clock "YYYY-MM-DDTHH:MM:SS±HH:MM" by the page,
    // so slicing [0:10] gives the local date in Jerusalem time.
    const startAtStr = typeof resumeDraft.startAt === "string" ? resumeDraft.startAt : undefined;
    const endAtStr = typeof resumeDraft.endAt === "string" ? resumeDraft.endAt : undefined;
    const allDay = typeof resumeDraft.allDay === "boolean" ? resumeDraft.allDay : false;
    const startDate = startAtStr?.slice(0, 10);
    const endDate = endAtStr?.slice(0, 10);
    return {
      date: initialDate ?? startDate,
      title: typeof resumeDraft.title === "string" ? resumeDraft.title : undefined,
      startAt: startAtStr,
      endAt: endAtStr,
      allDay,
      multiDay: Boolean(allDay && startDate && endDate && startDate !== endDate),
      endDate,
      eventTypeId:
        typeof resumeDraft.eventTypeId === "string" ? resumeDraft.eventTypeId : undefined,
      grades: Array.isArray(resumeDraft.grades) ? (resumeDraft.grades as number[]) : undefined,
      responsibleText: typeof resumeDraft.location === "string" ? resumeDraft.location : undefined,
      requirementsText:
        typeof resumeDraft.description === "string" ? resumeDraft.description : undefined,
    };
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const save = useCallback(
    async (patch: WizardData): Promise<string> => {
      if (!eventId && !patch.eventTypeId) {
        throw new Error("missing_event_type");
      }
      setSaving(true);
      try {
        if (!eventId) {
          const res = await fetch("/api/v1/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventTypeId: patch.eventTypeId }),
          });
          if (!res.ok) throw new Error("Failed to create draft");
          const json = (await res.json()) as { id: string };
          setEventId(json.id);
          // Immediately PATCH with all buffered data so nothing is lost.
          const buffered = toApiBody(patch);
          delete buffered.eventTypeId;
          const hasBuffered = Object.keys(buffered).length > 0;
          if (hasBuffered) {
            const patchRes = await fetch(`/api/v1/events/${json.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buffered),
            });
            if (!patchRes.ok) throw new Error("Failed to save buffered draft data");
          }
          return json.id;
        } else {
          const res = await fetch(`/api/v1/events/${eventId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toApiBody(patch)),
          });
          if (!res.ok) throw new Error("Failed to save step");
          return eventId;
        }
      } finally {
        setSaving(false);
      }
    },
    [eventId],
  );

  const patchData = useCallback((patch: WizardData) => {
    setData((current) => ({ ...current, ...patch }));
    setNotice("");
    setError("");
  }, []);

  const normalizedData = useCallback((): WizardData => {
    const dateStr = data.date ?? "";
    const allDay = data.multiDay || data.allDay || false;
    const startTime = data.startAt?.slice(11, 16) ?? "08:00";
    const endTime = data.endAt?.slice(11, 16) ?? "09:00";
    const endDate = data.multiDay && data.endDate ? data.endDate : undefined;
    const range = dateStr && (!endDate || endDate >= dateStr)
      ? buildEventTimeRange({ startDate: dateStr, endDate, allDay, startTime, endTime })
      : undefined;

    return {
      ...data,
      title: data.title?.trim(),
      responsibleText: data.responsibleText?.trim(),
      requirementsText: data.requirementsText?.trim() || undefined,
      allDay,
      startAt: range?.startAt,
      endAt: range?.endAt,
    };
  }, [data]);

  const validate = useCallback(
    (draft: WizardData): string => {
      if (!draft.title?.trim()) return t4("errorRequired");
      if (draft.title.length > 120) return t4("errorTooLong");
      if (!draft.date) return t1("errorRequired");
      if (!draft.eventTypeId) return t3("errorRequired");
      if (!draft.grades || draft.grades.length === 0) return t2("errorRequired");
      if (draft.multiDay && (!draft.date || !draft.endDate || draft.endDate < draft.date)) {
        return t5("errorEndBeforeStart");
      }
      if (!draft.allDay && draft.startAt && draft.endAt) {
        const start = draft.startAt.slice(11, 16);
        const end = draft.endAt.slice(11, 16);
        if (start >= end) return t5("errorInverted");
      }
      return "";
    },
    [t1, t2, t3, t4, t5],
  );

  const handleSaveDraft = useCallback(async () => {
    const draft = normalizedData();
    if (!draft.eventTypeId) {
      setError(t3("errorRequired"));
      return;
    }
    setError("");
    try {
      await save(draft);
      setNotice(te("saved"));
    } catch {
      setError(te("saveError"));
    }
  }, [normalizedData, save, t3, te]);

  const handleSubmit = useCallback(async () => {
    const draft = normalizedData();
    const validationError = validate(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPublishing(true);
    setError("");
    try {
      const body = toApiBody(draft);
      let res: Response;
      if (!eventId) {
        if (!draft.eventTypeId) throw new Error("missing_event_type");
        res = await fetch("/api/v1/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, eventTypeId: draft.eventTypeId, publish: true }),
        });
      } else {
        res = await fetch(`/api/v1/events/${eventId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error("Submit failed");
      router.push("/dashboard");
    } catch {
      setError(t7("submitError"));
      setPublishing(false);
    }
  }, [eventId, normalizedData, router, t7, validate]);

  const selectedEventType = eventTypes.find((type) => type.id === data.eventTypeId);
  const startTime = data.startAt?.slice(11, 16) ?? "08:00";
  const endTime = data.endAt?.slice(11, 16) ?? "09:00";

  return (
    <main
      className="min-h-screen bg-[color-mix(in_oklch,var(--sg-bg)_72%,#000_28%)] px-3 py-5 sm:px-6"
      dir="rtl"
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-black/5">
        <header className="flex items-center justify-between border-b border-[var(--sg-hairline)] px-6 py-5 sm:px-10">
          <h1 className="text-3xl font-semibold text-[var(--sg-ink)]">
            {resumeId ? te("editEyebrow") : te("createEyebrow")}
          </h1>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            aria-label={tc("cancel")}
            className="grid size-10 place-items-center rounded-full text-[var(--sg-ink-soft)] hover:bg-[var(--sg-surface-2)] hover:text-[var(--sg-ink)]"
          >
            <X className="size-7" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-7 px-6 py-6 sm:px-10">
          <Field label={t4("title")}>
            <input
              type="text"
              value={data.title ?? ""}
              maxLength={120}
              onChange={(e) => patchData({ title: e.target.value })}
              placeholder={te("titlePlaceholder")}
              aria-label={t4("title")}
              className="block min-h-14 w-full rounded-[18px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-4 text-lg transition outline-none focus:border-sky-400 focus:bg-white"
              autoFocus
            />
          </Field>

          <Field label={te("detailsLabel")}>
            <textarea
              value={data.requirementsText ?? ""}
              maxLength={2000}
              onChange={(e) => patchData({ requirementsText: e.target.value })}
              rows={4}
              placeholder={te("detailsPlaceholder")}
              aria-label={te("detailsLabel")}
              className="block w-full resize-y rounded-[18px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-4 py-3 text-base transition outline-none focus:border-sky-400 focus:bg-white"
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={t1("title")}>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  value={data.date ?? ""}
                  onChange={(e) => {
                    const date = e.target.value;
                    patchData({
                      date,
                      endDate: data.multiDay && (data.endDate ?? "") < date ? date : data.endDate,
                    });
                  }}
                  aria-label={t1("title")}
                  className="block min-h-12 w-full rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-4 text-base transition outline-none focus:border-sky-400 focus:bg-white"
                />
                {data.multiDay && (
                  <input
                    type="date"
                    value={data.endDate ?? ""}
                    min={data.date}
                    onChange={(e) => patchData({ endDate: e.target.value })}
                    aria-label={t5("endDate")}
                    className="block min-h-12 w-full rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-4 text-base transition outline-none focus:border-sky-400 focus:bg-white"
                  />
                )}
              </div>
            </Field>

            <Field label={t5("title")}>
              <div className="grid grid-cols-2 items-end gap-2">
                <input
                  type="time"
                  value={startTime}
                  disabled={data.allDay}
                  onChange={(e) =>
                    patchData({
                      startAt: jerusalemWallClockToIso(data.date ?? "", e.target.value),
                    })
                  }
                  aria-label={t5("startLabel")}
                  className="min-h-12 min-w-0 rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-base transition outline-none focus:border-sky-400 focus:bg-white disabled:opacity-45"
                />
                <input
                  type="time"
                  value={endTime}
                  disabled={data.allDay}
                  onChange={(e) =>
                    patchData({
                      endAt: jerusalemWallClockToIso(data.date ?? "", e.target.value),
                    })
                  }
                  aria-label={t5("endLabel")}
                  className="min-h-12 min-w-0 rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-base transition outline-none focus:border-sky-400 focus:bg-white disabled:opacity-45"
                />
                <label className="flex min-h-12 items-center gap-2 rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-sm text-[var(--sg-ink)]">
                  <input
                    type="checkbox"
                    checked={data.allDay ?? false}
                    disabled={data.multiDay}
                    onChange={(e) => patchData({ allDay: e.target.checked })}
                  />
                  <span className="whitespace-nowrap">{t5("allDay")}</span>
                </label>
                <label className="flex min-h-12 items-center gap-2 rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-3 text-sm text-[var(--sg-ink)]">
                  <input
                    type="checkbox"
                    checked={data.multiDay ?? false}
                    onChange={(e) =>
                      patchData({
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
              value={data.eventTypeId ?? ""}
              onChange={(e) => patchData({ eventTypeId: e.target.value || undefined })}
              aria-label={t3("title")}
              className="block min-h-12 w-full rounded-[14px] border-2 border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-4 text-base transition outline-none focus:border-sky-400 focus:bg-white"
            >
              <option value="">{te("selectType")}</option>
              {eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.glyph} {type.labelHe}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t3("title")}>
              {eventTypes.map((type) => {
                const active = selectedEventType?.id === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={type.labelHe}
                    onClick={() => patchData({ eventTypeId: type.id })}
                    className={`grid size-9 place-items-center rounded-full border-2 text-sm transition ${
                      active
                        ? "border-[var(--sg-ink)] bg-white shadow-sm"
                        : "border-transparent hover:border-[var(--sg-hairline)]"
                    }`}
                  >
                    <span
                      className="block size-6 rounded-full"
                      style={{ backgroundColor: type.colorHex }}
                    />
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t2("title")}>
            <div className="flex flex-wrap gap-2">
              {allowedGrades.map((grade) => {
                const active = data.grades?.includes(grade) ?? false;
                return (
                  <button
                    key={grade}
                    type="button"
                    data-grade={grade}
                    aria-pressed={active}
                    onClick={() =>
                      patchData({
                        grades: active
                          ? (data.grades ?? []).filter((g) => g !== grade)
                          : [...(data.grades ?? []), grade],
                      })
                    }
                    className={`min-h-11 min-w-12 rounded-full border-2 px-4 text-base font-medium transition ${
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

          <details className="rounded-[18px] border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--sg-ink-mute)]">
              {te("moreOptions")}
            </summary>
            <label className="mt-4 block">
              <span className="text-xs font-bold tracking-wide text-[var(--sg-ink-soft)] uppercase">
                {t6("title")}
              </span>
              <input
                type="text"
                value={data.responsibleText ?? ""}
                maxLength={80}
                onChange={(e) => patchData({ responsibleText: e.target.value })}
                placeholder={te("responsiblePlaceholder")}
                aria-label={t6("title")}
                className="mt-2 block min-h-12 w-full rounded-[14px] border-2 border-[var(--sg-hairline)] bg-white px-4 text-base transition outline-none focus:border-sky-400"
              />
            </label>
          </details>

          {error && (
            <p
              role="alert"
              className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sg-hairline)] pt-6">
            <div className="min-h-6 text-sm">
              {notice && <span className="text-green-700">{notice}</span>}
              {saving && <span className="text-[var(--sg-ink-soft)]">{tc("saving")}</span>}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="min-h-12 rounded-[14px] border-2 border-[var(--sg-hairline)] bg-white px-6 text-base font-medium text-[var(--sg-ink-mute)] hover:bg-[var(--sg-surface-2)]"
              >
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || publishing}
                className="min-h-12 rounded-[14px] border-2 border-[var(--sg-hairline)] bg-white px-6 text-base font-medium text-[var(--sg-ink)] hover:bg-[var(--sg-surface-2)] disabled:opacity-50"
              >
                {te("saveDraft")}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || publishing}
                className="min-h-12 rounded-[14px] bg-sky-500 px-7 text-base font-bold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {publishing ? t7("submitting") : t7("submit")}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-bold tracking-wide text-[var(--sg-ink-soft)] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
