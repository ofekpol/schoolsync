import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { GridCells, GridLesson, Slot } from "@/lib/timetable/grid";
import type { Week } from "@/lib/timetable/week";

export type CellLessons = Array<GridLesson & { pinned: boolean }>;

interface Props {
  week: Week;
  cells: GridCells;
  renderCell: (slot: Slot, lessons: CellLessons, exists: boolean) => ReactNode;
}

/** One class's or teacher's week: days across, periods down; `renderCell` fills each slot. */
export function WeekTable({ week, cells, renderCell }: Props) {
  const t = useTranslations("timetable.generate");
  const tc = useTranslations("timetable.constraints");
  const periods = Math.max(...week.days.map((d) => d.periods.length));
  const startOf = (period: number) => week.days.flatMap((d) => d.periods).find((p) => p.period === period)?.start ?? "";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm print:min-w-0 print:text-[10pt]">
        <thead>
          <tr>
            <th scope="col" className="border border-neutral-200 p-2"><span className="sr-only">{t("cornerLabel")}</span></th>
            {week.days.map((d) => <th key={d.day} scope="col" className="border border-neutral-200 bg-neutral-50 p-2">{tc(`days.${d.day}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: periods }, (_, i) => i + 1).map((period) => (
            <tr key={period}>
              <th scope="row" className="border border-neutral-200 bg-neutral-50 p-2 text-start font-medium">
                {t("periodLabel", { period })}
                <span className="block text-xs font-normal text-neutral-600">{startOf(period)}</span>
              </th>
              {week.days.map((d) => {
                const lessons = cells.get(`${d.day}:${period}`) ?? [];
                const exists = d.periods.some((x) => x.period === period);
                return (
                  <td key={d.day} data-testid={`cell-${d.day}-${period}`}
                    className={`border border-neutral-200 p-2 align-top ${exists ? "" : "bg-neutral-100 text-neutral-600"}`}>
                    {!exists && <p className="text-xs">{t("noPeriod")}</p>}
                    {lessons.length > 1 && (
                      <p className="mb-1 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-900">
                        <AlertTriangle aria-hidden className="size-3.5" />{t("clash")}
                      </p>
                    )}
                    {renderCell({ day: d.day, period }, lessons, exists)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
