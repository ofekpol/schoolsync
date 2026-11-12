"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { AgendaItem } from "@/lib/views/agenda-model";
import { formatGradeLabel } from "@/lib/grades";
import { buildGoogleCalendarUrl } from "@/lib/google-calendar-url";
import { jerusalemWallClockToIso } from "@/lib/datetime";
import type { EventType } from "@/components/wizard/WizardShell";

interface Props {
  event: (AgendaItem & { canEdit?: boolean }) | null;
  canEdit?: boolean;
  eventTypes?: EventType[];
  allowedGrades?: number[];
  onSave?: (patch: EventEditPatch) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onDismiss?: () => Promise<boolean>;
  onClose: () => void;
}

interface EventEditPatch {
  title: string;
  description?: string;
  location?: string;
  eventTypeId: string;
  grades: number[];
  startAt: string;
  endAt: string;
  allDay: boolean;
}

interface EventEditData {
  title: string;
  description: string;
  location: string;
  eventTypeId: string;
  grades: number[];
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
}

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  dateStyle: "long",
});
const timeFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  hour: "2-digit",
  minute: "2-digit",
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function EventDrawer({
  event,
  canEdit = false,
  eventTypes = [],
  allowedGrades = [],
  onSave,
  onDelete,
  onDismiss,
  onClose,
}: Props) {
  const t = useTranslations("gantt.drawer");
  const tExport = useTranslations("export");
  const td = useTranslations("dashboard");
  const ta = useTranslations("a11y");
  const tg = useTranslations("grades");
  const t1 = useTranslations("wizard.step1");
  const t2 = useTranslations("wizard.step2");
  const t3 = useTranslations("wizard.step3");
  const t4 = useTranslations("wizard.step4");
  const t5 = useTranslations("wizard.step5");
  const t7 = useTranslations("wizard.step7");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventEditData | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!event) return;
    closeButtonRef.current?.focus();
    setEditing(false);
    setDraft(buildEditData(event));
    setError("");
    setSaving(false);
    setDeleting(false);
    setDismissing(false);
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [event, onClose]);

  if (!event) return null;

  const startDate = new Date(event.startAt);
  const endDate = new Date(event.endAt);
  const selectedType = eventTypes.find((type) => type.id === (draft?.eventTypeId ?? event.eventTypeId));
  const headerColor = selectedType?.colorHex ?? event.eventTypeColor;
  const headerGlyph = selectedType?.glyph ?? event.eventTypeGlyph;
  const headerLabel = selectedType?.labelHe ?? event.eventTypeLabelHe;
  const title = editing && draft ? draft.title : event.title;
  const statusLabel = event.isCanceled ? td("canceled") : event.isUpdated ? td("updated") : null;

  function patchDraft(patch: Partial<EventEditData>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setError("");
  }

  function validate(): string {
    if (!draft) return t7("submitError");
    if (!draft.title.trim()) return t4("errorRequired");
    if (!draft.date) return t1("errorRequired");
    if (!draft.eventTypeId) return t3("errorRequired");
    if (draft.grades.length === 0) return t2("errorRequired");
    if (!draft.allDay && (!TIME_RE.test(draft.startTime) || !TIME_RE.test(draft.endTime))) {
      return t5("errorInvalid");
    }
    if (!draft.allDay && draft.startTime >= draft.endTime) return t5("errorInverted");
    return "";
  }

  async function save() {
    const validationError = validate();
    if (validationError || !draft || !onSave) {
      setError(validationError || t7("submitError"));
      return;
    }

    const startAt = jerusalemWallClockToIso(draft.date, draft.allDay ? "00:00:00" : draft.startTime);
    const endAt = jerusalemWallClockToIso(draft.date, draft.allDay ? "23:59:59" : draft.endTime);

    setSaving(true);
    const ok = await onSave({
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      location: draft.location.trim() || undefined,
      eventTypeId: draft.eventTypeId,
      grades: draft.grades,
      startAt,
      endAt,
      allDay: draft.allDay,
    });
    setSaving(false);
    if (!ok) {
      setError(t7("submitError"));
      return;
    }
    setEditing(false);
  }

  async function deleteEvent() {
    if (!onDelete) return;
    const confirmed = window.confirm(td("deleteConfirm"));
    if (!confirmed) return;
    setDeleting(true);
    const ok = await onDelete();
    setDeleting(false);
    if (!ok) {
      setError(td("deleteError"));
    }
  }

  async function dismissEvent() {
    if (!onDismiss) return;
    const confirmed = window.confirm(td("dismissCanceledConfirm"));
    if (!confirmed) return;
    setDismissing(true);
    const ok = await onDismiss();
    setDismissing(false);
    if (!ok) {
      setError(td("dismissCanceledError"));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-drawer-title"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.35)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460,
          background: "var(--sg-surface)",
          borderRadius: 14,
          boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
          maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          fontFamily: "var(--sg-font-ui)",
        }}
      >
        {/* Tinted header */}
        <div style={{
          padding: 18,
          background: `color-mix(in oklch, ${headerColor} 16%, white)`,
          borderBottom: `4px solid ${headerColor}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 6, flexShrink: 0,
              background: headerColor, color: "white",
              display: "grid", placeItems: "center", fontSize: 14,
            }}>
              {headerGlyph}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: "var(--sg-ink-mute)",
              letterSpacing: "0.04em", textTransform: "uppercase",
              fontFamily: "var(--sg-font-mono)",
            }}>
              {headerLabel}
            </span>
            {statusLabel && (
              <span
                style={{
                  borderRadius: 999,
                  background: event.isCanceled ? "#fee2e2" : "#dbeafe",
                  color: event.isCanceled ? "#991b1b" : "#1e40af",
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {statusLabel}
              </span>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={ta("closeDialog")}
              style={{
                marginInlineStart: "auto",
                width: 28, height: 28, display: "grid", placeItems: "center",
                border: "1px solid var(--sg-hairline)", borderRadius: 6,
                background: "rgba(255,255,255,0.6)", cursor: "pointer",
                fontSize: 14, color: "var(--sg-ink-mute)",
              }}
            >
              ✕
            </button>
          </div>
          <h2
            id="event-drawer-title"
            style={{
              fontFamily: "var(--sg-font-display)", fontSize: 22, fontWeight: 600,
              lineHeight: 1.15, margin: 0, color: "var(--sg-ink)",
            }}
          >
            {editing && draft ? (
              <input
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
                aria-label={t4("title")}
                style={{
                  width: "100%",
                  border: "1px solid var(--sg-hairline)",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.75)",
                  padding: "7px 10px",
                  font: "inherit",
                  color: "inherit",
                  outline: "none",
                }}
              />
            ) : (
              <span style={{ textDecoration: event.isCanceled ? "line-through" : "none" }}>
                {title}
              </span>
            )}
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
          {editing && draft ? (
            <>
              <DetailRow
                label={t("date")}
                value={
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => patchDraft({ date: e.target.value })}
                    style={inputStyle}
                  />
                }
              />
              <DetailRow
                label="שעות"
                value={
                  <div
                    dir="ltr"
                    style={{
                      display: "grid",
                      // minmax(0, …) lets the time inputs shrink below their intrinsic
                      // width; plain 1fr pushed the start time off-screen on phones.
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="time"
                      aria-label={t5("startLabel")}
                      value={draft.startTime}
                      disabled={draft.allDay}
                      onChange={(e) => patchDraft({ startTime: e.target.value })}
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                    <input
                      type="time"
                      aria-label={t5("endLabel")}
                      value={draft.endTime}
                      disabled={draft.allDay}
                      onChange={(e) => patchDraft({ endTime: e.target.value })}
                      style={{ ...inputStyle, minWidth: 0 }}
                    />
                    <label
                      dir="rtl"
                      style={{ gridColumn: "1 / -1", display: "flex", gap: 6, alignItems: "center", fontSize: 12, whiteSpace: "nowrap" }}
                    >
                      <input
                        type="checkbox"
                        checked={draft.allDay}
                        onChange={(e) => patchDraft({ allDay: e.target.checked })}
                      />
                      {t5("allDay")}
                    </label>
                  </div>
                }
              />
              <DetailRow
                label={t("type")}
                value={
                  <select
                    value={draft.eventTypeId}
                    onChange={(e) => patchDraft({ eventTypeId: e.target.value })}
                    style={inputStyle}
                  >
                    {eventTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.glyph} {type.labelHe}
                      </option>
                    ))}
                  </select>
                }
              />
              <DetailRow
                label={t("grades")}
                value={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {allowedGrades.map((grade) => {
                      const active = draft.grades.includes(grade);
                      return (
                        <button
                          key={grade}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            patchDraft({
                              grades: active
                                ? draft.grades.filter((g) => g !== grade)
                                : [...draft.grades, grade],
                            })
                          }
                          style={{
                            fontFamily: "var(--sg-font-display)",
                            fontSize: 16,
                            fontWeight: 600,
                            background: active ? "var(--sg-ink)" : "var(--sg-surface-2)",
                            color: active ? "white" : "var(--sg-ink)",
                            border: "1px solid var(--sg-hairline)",
                            borderRadius: 6,
                            padding: "2px 10px",
                            cursor: "pointer",
                          }}
                        >
                          {tg(`label_${grade}` as `label_${7 | 8 | 9 | 10 | 11 | 12}`)}
                        </button>
                      );
                    })}
                  </div>
                }
              />
              <DetailRow
                label={t("location")}
                value={
                  <input
                    value={draft.location}
                    onChange={(e) => patchDraft({ location: e.target.value })}
                    style={inputStyle}
                  />
                }
              />
              <DetailRow
                label={t("description")}
                value={
                  <textarea
                    value={draft.description}
                    onChange={(e) => patchDraft({ description: e.target.value })}
                    rows={3}
                    style={{ ...inputStyle, height: "auto", resize: "vertical" }}
                  />
                }
              />
              {error && (
                <p role="alert" style={{ margin: 0, borderRadius: 8, background: "#fef2f2", padding: "8px 10px", color: "#b91c1c", fontSize: 13 }}>
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <DetailRow label={t("date")} value={dateFmt.format(startDate)} />
              {!event.allDay && (
                <DetailRow
                  label="שעות"
                  value={`${timeFmt.format(startDate)} – ${timeFmt.format(endDate)}`}
                />
              )}
              {event.grades.length > 0 && (
                <DetailRow
                  label={t("grades")}
                  value={
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {event.grades.map((g) => (
                        <span key={g} style={{
                          fontFamily: "var(--sg-font-display)", fontSize: 16, fontWeight: 600,
                          background: "var(--sg-surface-2)", border: "1px solid var(--sg-hairline)",
                          borderRadius: 6, padding: "2px 10px",
                        }}>
                          {formatGradeLabel(g)}
                        </span>
                      ))}
                    </div>
                  }
                />
              )}
              {event.location && <DetailRow label={t("location")} value={event.location} />}
              {event.description && <DetailRow label={t("description")} value={event.description} />}
            </>
          )}
        </div>
        {!editing && error && (
          <p role="alert" style={{ margin: "0 14px 12px", borderRadius: 8, background: "#fef2f2", padding: "8px 10px", color: "#b91c1c", fontSize: 13 }}>
            {error}
          </p>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, padding: 14,
          justifyContent: "flex-end",
          borderTop: "1px solid var(--sg-hairline)",
          background: "var(--sg-surface-2)",
        }}>
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(buildEditData(event));
                  setEditing(false);
                  setError("");
                }}
                style={secondaryButtonStyle}
              >
                {td("cancelEdit")}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving ? 0.55 : 1,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? td("saving") : td("save")}
              </button>
            </>
          ) : (
            <>
              <a
                href={buildGoogleCalendarUrl({
                  title: event.title,
                  start: startDate,
                  end: endDate,
                  description: event.description ?? undefined,
                  location: event.location ?? undefined,
                  allDay: event.allDay,
                })}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...secondaryButtonStyle, marginInlineEnd: "auto", textDecoration: "none" }}
              >
                {tExport("addToGoogle")}
              </a>
              {event.isCanceled && onDismiss && (
                <button
                  type="button"
                  onClick={dismissEvent}
                  disabled={dismissing}
                  style={{
                    ...dangerButtonStyle,
                    opacity: dismissing ? 0.55 : 1,
                    cursor: dismissing ? "default" : "pointer",
                  }}
                >
                  {dismissing ? td("dismissingCanceled") : td("dismissCanceled")}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={deleteEvent}
                  disabled={deleting}
                  style={{
                    ...dangerButtonStyle,
                    opacity: deleting ? 0.55 : 1,
                    cursor: deleting ? "default" : "pointer",
                  }}
                >
                  {deleting ? td("deleting") : td("delete")}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  style={primaryButtonStyle}
                >
                  {td("edit")}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              height: 32, padding: "0 14px",
              borderRadius: 8, border: "1px solid var(--sg-hairline)",
              background: "transparent", color: "var(--sg-ink-mute)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  border: "1px solid var(--sg-hairline)",
  borderRadius: 8,
  background: "var(--sg-surface-2)",
  padding: "6px 9px",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--sg-ink)",
  outline: "none",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  whiteSpace: "nowrap",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid var(--sg-accent)",
  background: "var(--sg-accent)",
  color: "white",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  whiteSpace: "nowrap",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid var(--sg-hairline)",
  background: "transparent",
  color: "var(--sg-ink-mute)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  display: "inline-flex",
  whiteSpace: "nowrap",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

function buildEditData(event: AgendaItem): EventEditData {
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    eventTypeId: event.eventTypeId ?? "",
    grades: event.grades,
    date: jerusalemDate(event.startAt),
    startTime: jerusalemTime(event.startAt),
    endTime: jerusalemTime(event.endAt),
    allDay: event.allDay,
  };
}

function jerusalemDate(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function jerusalemTime(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute}`;
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 12, alignItems: "baseline" }}>
      <dt style={{
        fontSize: 11, color: "var(--sg-ink-soft)", letterSpacing: "0.04em",
        fontFamily: "var(--sg-font-display)", fontWeight: 500,
      }}>
        {label}
      </dt>
      <dd style={{ fontSize: 14, fontWeight: 500, color: "var(--sg-ink)", margin: 0 }}>
        {typeof value === "string"
          ? <span style={{ whiteSpace: "pre-wrap" }}>{value}</span>
          : value}
      </dd>
    </div>
  );
}
