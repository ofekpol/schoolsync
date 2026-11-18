"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cellsFor, type GridLesson, type GridView, type SolutionGrid } from "@/lib/timetable/grid";
import { className } from "@/components/timetable/setup/className";
import { WeekTable } from "@/components/timetable/edit/WeekTable";
import { LessonEditor, type LessonText } from "@/components/timetable/edit/LessonEditor";
import type { CardNames } from "./ViolationList";

interface Props {
  boardId: string;
  runId: string;
  grid: SolutionGrid;
  view: GridView;
  editable: boolean;
  cardNames: CardNames;
}

/** Remounts the editor (dropping its local copy) only when the server's placements really changed. */
const signature = (grid: SolutionGrid) =>
  [grid.solution.reportStale, grid.published, ...grid.lessons.map((l) => `${l.blockId}@${l.day}.${l.period}${l.pinned ? "p" : ""}`),
    ...grid.unplaced.map((u) => `${u.blockId}x${u.missing}`)].join("|");

/** One class or teacher of one generated option: read-only, or the editor when `editable`. */
export function TimetableGrid({ boardId, runId, grid, view, editable, cardNames }: Props) {
  const t = useTranslations("timetable.generate");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const pathname = usePathname();
  const { names, week } = grid;

  const classLabel = (id: string) => {
    const c = names.classes[id];
    return c ? className(c.grade, c.number, (g) => tGrades(`label_${g}`)) : t("removedClass");
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

  const subjectOf = (l: GridLesson) =>
    l.subjectId === null ? t("meeting") : names.subjects[l.subjectId] ?? t("removedSubject");
  const teacherName = (id: string) => names.teachers[id] ?? t("removedTeacher");
  const otherOf = (l: GridLesson) =>
    view.kind === "class" ? l.teacherIds.map(teacherName).join(", ") : l.classIds.map(classLabel).join(", ");
  const text: LessonText = { subjectOf, otherOf, classLabel, teacherName };

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
      {editable ? (
        <LessonEditor key={signature(grid)} boardId={boardId} runId={runId} grid={grid} view={view} text={text} cardNames={cardNames} />
      ) : (
        <WeekTable week={week} cells={cellsFor(grid, view)} renderCell={(_slot, lessons) => lessons.map((l) => (
          <div key={l.blockId} className="mb-1">
            <p className="font-medium">{text.subjectOf(l)}</p>
            <p className="text-xs text-neutral-600">{text.otherOf(l)}</p>
          </div>
        ))} />
      )}
    </div>
  );
}
