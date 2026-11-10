"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlyphChip } from "./GlyphChip";
import type { EventTypeErrorKey, EventTypeRow } from "./types";

interface Props {
  row: EventTypeRow;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  error: EventTypeErrorKey | null;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => Promise<void>;
}

/** One compact event-type row; deleting asks for confirmation in place. */
export function EventTypeListItem(props: Props) {
  const { row, canManage, error } = props;
  const t = useTranslations("admin.eventTypes");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group px-3 py-1.5">
      <div className="flex min-h-9 items-center gap-2.5">
        {canManage && <MoveButtons {...props} />}
        <GlyphChip colorHex={row.colorHex} glyph={row.glyph} />
        <div className="min-w-0 flex-1 truncate">
          <span className="text-sm font-medium">{row.labelHe}</span>
          <span dir="ltr" className="ms-2 text-xs text-neutral-500">{row.labelEn}</span>
        </div>
        {canManage &&
          (confirming ? (
            <ConfirmDelete name={row.labelHe} onCancel={() => setConfirming(false)}
              onConfirm={async () => { await props.onDelete(); setConfirming(false); }} />
          ) : (
            <span className="flex gap-0.5 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <Button size="icon-sm" variant="ghost" aria-label={t("editNamed", { name: row.labelHe })}
                title={t("edit")} onClick={props.onEdit} disabled={props.disabled}>
                <Pencil />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("deleteNamed", { name: row.labelHe })}
                title={t("delete")} onClick={() => setConfirming(true)} disabled={props.disabled}
                className="hover:bg-destructive/10 hover:text-destructive">
                <Trash2 />
              </Button>
            </span>
          ))}
      </div>
      {error && <p role="alert" className="pb-1 ps-9 text-xs text-destructive">{t(error)}</p>}
    </div>
  );
}

function MoveButtons({ row, isFirst, isLast, disabled, onMove }: Props) {
  const t = useTranslations("admin.eventTypes");
  return (
    <span className="flex flex-col">
      <button type="button" aria-label={t("moveUp", { name: row.labelHe })}
        disabled={isFirst || disabled} onClick={() => onMove(-1)}
        className="rounded text-neutral-400 hover:text-neutral-900 disabled:invisible">
        <ChevronUp aria-hidden="true" className="size-3.5" />
      </button>
      <button type="button" aria-label={t("moveDown", { name: row.labelHe })}
        disabled={isLast || disabled} onClick={() => onMove(1)}
        className="rounded text-neutral-400 hover:text-neutral-900 disabled:invisible">
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}

function ConfirmDelete({ name, onConfirm, onCancel }: {
  name: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.eventTypes");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-neutral-700">{t("confirmDelete", { name })}</span>
      <Button size="xs" variant="destructive" autoFocus disabled={busy}
        onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>
        {busy ? tc("loading") : t("delete")}
      </Button>
      <Button size="xs" variant="ghost" onClick={onCancel} disabled={busy}>{t("cancel")}</Button>
    </span>
  );
}
