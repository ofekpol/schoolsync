"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileUp, X } from "lucide-react";
import { CalendarImport } from "@/components/admin/CalendarImport";

interface Props {
  template: string;
  typeLabels: Record<string, string>;
  buttonClassName?: string;
}

/** Admin-only "ייבוא לוח" button: opens the CSV calendar import in a dialog. */
export function CalendarImportButton({ template, typeLabels, buttonClassName }: Props) {
  const t = useTranslations("admin.import");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const importedRef = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    if (importedRef.current) {
      importedRef.current = false;
      router.refresh();
    }
  }, [router]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        <FileUp className="size-4" aria-hidden="true" />
        {t("button")}
      </button>
      {open && (
        <ImportDialog onClose={close} typeNames={Object.values(typeLabels).join(", ")}>
          <CalendarImport
            template={template}
            typeLabels={typeLabels}
            onImported={() => {
              importedRef.current = true;
            }}
          />
        </ImportDialog>
      )}
    </>
  );
}

function ImportDialog({
  onClose,
  typeNames,
  children,
}: {
  onClose: () => void;
  typeNames: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.import");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-lg bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="import-modal-title" className="text-lg font-semibold text-neutral-900">
              {t("title")}
            </h2>
            <p className="text-sm text-neutral-600">{t("intro")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ol className="list-decimal space-y-1 ps-6 text-sm text-neutral-800">
          <li>{t("step1")}</li>
          <li>{t("step2", { types: typeNames })}</li>
          <li>{t("step3")}</li>
        </ol>
        {children}
      </div>
    </div>
  );
}
