"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/admin/ColorPicker";
import { GlyphChip } from "./GlyphChip";
import type { EventTypeDraft, EventTypeErrorKey } from "./types";

interface Props {
  initial: EventTypeDraft;
  /** New types fill the glyph from the English name until it is typed by hand. */
  isNew: boolean;
  onSave: (draft: EventTypeDraft) => Promise<EventTypeErrorKey | null>;
  onCancel: () => void;
}

const INPUT =
  "h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function glyphFrom(labelEn: string): string {
  return labelEn.trim().charAt(0).toUpperCase();
}

/** Inline add/edit form for one event type. Enter saves, Escape cancels. */
export function EventTypeEditor({ initial, isNew, onSave, onCancel }: Props) {
  const t = useTranslations("admin.eventTypes");
  const tc = useTranslations("common");
  const id = useId();
  const [draft, setDraft] = useState<EventTypeDraft>(initial);
  const [glyphTouched, setGlyphTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<EventTypeErrorKey | null>(null);

  function set<K extends keyof EventTypeDraft>(key: K, value: EventTypeDraft[K]) {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "labelEn" && !glyphTouched) next.glyph = glyphFrom(String(value));
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const failure = await onSave(draft);
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      aria-label={isNew ? t("create") : t("editNamed", { name: initial.labelHe })}
      className="space-y-2.5 bg-neutral-50 px-3 py-3"
    >
      <div className="flex flex-wrap items-end gap-2">
        <GlyphChip colorHex={draft.colorHex} glyph={draft.glyph} className="mb-0.5" />
        <Field id={`${id}-he`} label={t("labelHe")} className="min-w-36 flex-1">
          <input id={`${id}-he`} required autoFocus maxLength={80} value={draft.labelHe}
            onChange={(e) => set("labelHe", e.target.value)} className={INPUT} />
        </Field>
        <Field id={`${id}-en`} label={t("labelEn")} className="min-w-36 flex-1">
          <input id={`${id}-en`} required dir="ltr" maxLength={80} value={draft.labelEn}
            onChange={(e) => set("labelEn", e.target.value)} className={INPUT} />
        </Field>
        <Field id={`${id}-glyph`} label={t("glyph")} className="w-16">
          <input id={`${id}-glyph`} required dir="ltr" maxLength={2} value={draft.glyph}
            title={t("glyphHint")}
            onChange={(e) => { setGlyphTouched(true); set("glyph", e.target.value.toUpperCase()); }}
            className={`${INPUT} text-center font-semibold`} />
        </Field>
      </div>
      <ColorPicker value={draft.colorHex} onChange={(hex) => set("colorHex", hex)} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? tc("saving") : t("save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {t("cancel")}
        </Button>
        {error && <span role="alert" className="text-xs text-destructive">{t(error)}</span>}
      </div>
    </form>
  );
}

function Field({ id, label, className, children }: {
  id: string;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-0.5 block text-xs text-neutral-600">{label}</label>
      {children}
    </div>
  );
}
