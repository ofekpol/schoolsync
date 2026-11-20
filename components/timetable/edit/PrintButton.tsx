"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

export function PrintButton() {
  const t = useTranslations("timetable.edit");
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 print:hidden">
      <Printer aria-hidden className="size-4" />{t("print")}
    </button>
  );
}
