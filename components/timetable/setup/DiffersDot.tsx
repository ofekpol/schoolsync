"use client";

import { useTranslations } from "next-intl";

/** The small mark on a cell whose weekly periods differ from the grade's standard. */
export function DiffersDot({ norm }: { norm: number }) {
  const t = useTranslations("timetable.setup.lessons");
  return (
    <span title={t("differs", { norm })} className="absolute end-0 top-0 size-1.5 rounded-full bg-amber-500">
      <span className="sr-only">{t("differs", { norm })}</span>
    </span>
  );
}
