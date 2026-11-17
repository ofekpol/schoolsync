"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { cellsFor, type GridLesson, type GridView, type SolutionGrid } from "@/lib/timetable/grid";
import { className } from "@/components/timetable/setup/className";

interface Props {
  boardId: string;
  grid: SolutionGrid;
  view: GridView;
}

/** A read-only week table of one class or teacher in one generated option. */
export function TimetableGrid({ boardId, grid, view }: Props) {
  const t = useTranslations("timetable.generate");
  const tc = useTranslations("timetable.constraints");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const pathname = usePathname();
  const { names, week } = grid;

  const classLabel = (id: string) => {
    const c = names.classes[id];
    return c ? className(c.grade, c.number, (g) => tGrades(`label_${g}`)) : "";
  };
  const classIds = Object.keys(names.classes).sort(
    (a, b) => names.classes[a].grade - names.classes[b].grade || names.classes[a].number - names.classes[b].number);
  const teacherIds = Object.keys(names.teachers).sort((a, b) => names.teachers[a].localeCompare(names.teachers[b]));
  const options = view.kind === "class" ? classIds : teacherIds;
  const label = (id: string) => (view.kind === "class" ? classLabel(id) : names.teachers[id] ?? "");

  const go = (kind: GridView["kind"], id: string) => router.replace(`${pathname}?view=${kind}&id=${id}` as Route);
  const switchTo = (kind: GridView["kind"]) => {
    const first = (kind === "class" ? classIds : teacherIds)[0];
    if (first) go(kind, first);
  };

  const cells = cellsFor(grid, view);
  const periods = Math.max(...week.days.map((d) => d.periods.length));
  const startOf = (period: number) => week.days.flatMap((d) => d.periods).find((p) => p.period === period)?.start ?? "";

  const subjectOf = (l: GridLesson) =>
    l.subjectId === null ? t("meeting") : names.subjects[l.subjectId] ?? t("removedSubject");
  const otherOf = (l: GridLesson) =>
    view.kind === "class"
      ? l.teacherIds.map((id) => names.teachers[id] ?? tc("removedTeacher")).join(", ")
      : l.classIds.map(classLabel).join(", ");

  return (
    <div className="space-y-4">
      <Link href={`/timetable/${boardId}/generate`} className="text-sm text-violet-700 hover:underline">{t("backToOptions")}</Link>
      <div className="flex flex-wrap items-center gap-2">
        {(["class", "teacher"] as const).map((kind) => (
          <button key={kind} type="button" aria-pressed={view.kind === kind} onClick={() => switchTo(kind)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm aria-pressed:border-violet-700 aria-pressed:bg-violet-700 aria-pressed:text-white">
            {t(kind === "class" ? "viewClass" : "viewTeacher")}
          </button>
        ))}
        <select aria-label={t(view.kind === "class" ? "pickClass" : "pickTeacher")} value={view.id}
          onChange={(e) => go(view.kind, e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
          {options.map((id) => <option key={id} value={id}>{label(id)}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-neutral-200 p-2" />
              {week.days.map((d) => <th key={d.day} className="border border-neutral-200 bg-neutral-50 p-2">{tc(`days.${d.day}`)}</th>)}
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
                  return (
                    <td key={d.day} data-testid={`cell-${d.day}-${period}`} className="border border-neutral-200 p-2 align-top">
                      {lessons.length > 1 && (
                        <p className="mb-1 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-900">
                          <AlertTriangle aria-hidden className="size-3.5" />{t("clash")}
                        </p>
                      )}
                      {lessons.map((l) => (
                        <div key={l.blockId} className="mb-1">
                          <p className="font-medium">{subjectOf(l)}</p>
                          <p className="text-xs text-neutral-600">{otherOf(l)}</p>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
