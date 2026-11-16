"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffDialog } from "@/components/admin/staff-ui";
import { cleanNames } from "@/lib/timetable/errors";
import { MAX_NAME_LENGTH } from "@/lib/validations/timetable";

interface Props {
  title: string;
  /** Called with trimmed names, blanks and repeats dropped. Rejecting keeps the dialog open. */
  onSubmit: (names: string[]) => Promise<void>;
}

/** A button that opens a textarea for pasting one name per line (subjects or teachers). */
export function PasteNamesDialog({ title, onSubmit }: Props) {
  const t = useTranslations("timetable.setup");
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tooLong, setTooLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const names = cleanNames(text.split("\n"));

  function close() {
    setOpen(false);
    setText("");
    setTooLong(false);
  }

  async function submit() {
    if (names.some((name) => name.length > MAX_NAME_LENGTH)) return setTooLong(true);
    setBusy(true);
    try {
      await onSubmit(names);
      close();
    } catch {
      // The caller shows why; the pasted text stays for another try.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardPaste aria-hidden className="size-4" />
        {title}
      </Button>
      {open && (
        <StaffDialog titleId={titleId} title={title} subtitle={t("paste.hint")} closeLabel={t("close")}
          onClose={close} size="md">
          <textarea aria-label={title} value={text} rows={10} dir="auto"
            onChange={(event) => { setText(event.target.value); setTooLong(false); }}
            className="w-full rounded-lg border border-neutral-300 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
          {tooLong && (
            <p role="alert" className="mt-2 text-sm text-red-700">{t("paste.tooLong", { max: MAX_NAME_LENGTH })}</p>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-neutral-500">{t("paste.count", { count: names.length })}</span>
            <Button type="button" onClick={submit} disabled={names.length === 0 || busy}>{t("paste.add")}</Button>
          </div>
        </StaffDialog>
      )}
    </>
  );
}
