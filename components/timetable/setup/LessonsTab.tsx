"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TtBlock } from "@/lib/timetable/blocks";
import type { TtClass } from "@/lib/timetable/classes";
import type { TtSubject } from "@/lib/timetable/subjects";
import type { TtTeacher } from "@/lib/timetable/teachers";
import { cn } from "@/lib/utils";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { className } from "./className";
import { LessonCell, type CellDraft } from "./LessonCell";
import { buildLessonsGrid, cellKey, classTotals, teacherOptions, type Cell } from "./lessons-grid";

interface Props {
  boardId: string;
  classes: TtClass[];
  subjects: TtSubject[];
  blocks: TtBlock[];
  teachers: TtTeacher[];
  /** Teaching slots in the board's week. */
  slots: number;
}

/** Saves one cell: creates, replaces or (no periods) deletes the class's ordinary block. */
async function saveCell(boardId: string, classId: string, subjectId: string, cell: Cell, draft: CellDraft) {
  const existing = cell.kind === "lesson" ? cell.block : null;
  if (draft.periods === 0) return existing ? api.deleteBlock(boardId, existing.id) : null;
  const input = {
    subjectId,
    weeklyPeriods: draft.periods,
    classIds: [classId],
    teacherIds: draft.teacherId ? [draft.teacherId] : [],
  };
  return existing ? api.replaceBlock(boardId, existing.id, input) : api.createBlock(boardId, input);
}

/** Arrow keys move between the periods inputs (RTL: ArrowLeft is the next column). */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, 1], ArrowRight: [0, -1] }[event.key];
  if (!step || target.dataset.row === undefined) return;
  const row = Number(target.dataset.row) + step[0];
  const col = Number(target.dataset.col) + step[1];
  const next = event.currentTarget.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/** A grade's classes as columns, subjects as rows; each cell is that class's lesson in that subject. */
export function LessonsTab({ boardId, classes, subjects, blocks, teachers, slots }: Props) {
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const datalistId = useId();
  const grades = [...new Set(classes.map((c) => c.grade))];
  const [grade, setGrade] = useState(grades[0] ?? 7);
  const gradeClasses = classes.filter((c) => c.grade === grade);
  const grid = useMemo(() => buildLessonsGrid(gradeClasses, subjects, blocks), [gradeClasses, subjects, blocks]);
  const totals = classTotals(gradeClasses, blocks);
  const options = useMemo(() => teacherOptions(teachers), [teachers]);
  const label = (g: number) => tGrades(`label_${g}`);

  async function save(classId: string, subjectId: string, draft: CellDraft): Promise<SetupErrorKey | null> {
    const res = await saveCell(boardId, classId, subjectId, grid.get(cellKey(classId, subjectId))!, draft);
    if (res && !res.ok) return res.error;
    router.refresh();
    return null;
  }

  if (grades.length === 0) return <p className="text-sm text-neutral-600">{t("lessons.noClasses")}</p>;
  if (subjects.length === 0) return <p className="text-sm text-neutral-600">{t("lessons.noSubjects")}</p>;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">{t("lessons.grade")}</span>
        <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}
          className="h-9 rounded-lg border border-neutral-300 px-2">
          {grades.map((g) => <option key={g} value={g}>{t("lessons.gradeOption", { grade: label(g) })}</option>)}
        </select>
      </label>
      <datalist id={datalistId}>
        {options.map((o) => <option key={o.id} value={o.label} />)}
      </datalist>
      <div onKeyDown={moveFocus} className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th scope="col" className="sticky start-0 bg-neutral-50 px-3 py-2 text-start font-medium">{t("lessons.subject")}</th>
              {gradeClasses.map((c) => (
                <th key={c.id} scope="col" className="min-w-28 px-2 py-2 font-semibold text-neutral-800">
                  {className(c.grade, c.number, label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {subjects.map((subject, row) => (
              <tr key={subject.id}>
                <th scope="row" className="sticky start-0 bg-white px-3 py-1 text-start font-medium">{subject.name}</th>
                {gradeClasses.map((c, col) => {
                  const key = cellKey(c.id, subject.id);
                  const cell = grid.get(key)!;
                  return (
                    <td key={`${key}:${cell.kind === "empty" ? "" : cell.block.id}`} className="align-top">
                      <LessonCell cell={cell} row={row} col={col} teachers={options} datalistId={datalistId}
                        label={t("lessons.cellLabel", { subject: subject.name, class: className(c.grade, c.number, label) })}
                        onSave={(draft) => save(c.id, subject.id, draft)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50 text-xs">
            <tr>
              <th scope="row" className="sticky start-0 bg-neutral-50 px-3 py-2 text-start font-medium">{t("lessons.total")}</th>
              {gradeClasses.map((c) => {
                const total = totals.get(c.id) ?? 0;
                return (
                  <td key={c.id} className={cn("px-2 py-2 text-center tabular-nums", total > slots ? "font-bold text-red-700" : "text-neutral-600")}>
                    {t("lessons.totalOf", { total, slots })}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
