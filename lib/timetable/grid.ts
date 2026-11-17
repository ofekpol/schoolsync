import type { Week } from "./week";
import type { SolutionSummary } from "./runs";

export interface GridLesson {
  blockId: string;
  subjectId: string | null;
  classIds: string[];
  teacherIds: string[];
}
export interface SolutionGrid {
  solution: SolutionSummary;
  week: Week;
  lessons: Array<GridLesson & { day: number; period: number }>;
  names: {
    classes: Record<string, { grade: number; number: number }>;
    teachers: Record<string, string>;
    subjects: Record<string, string>;
  };
}
export type GridView = { kind: "class" | "teacher"; id: string };
export type GridCells = Map<string, GridLesson[]>; // key `${day}:${period}`

/** The lessons of one class or teacher, grouped by slot. A clash keeps both lessons in the cell. */
export function cellsFor(grid: Pick<SolutionGrid, "lessons">, view: GridView): GridCells {
  const cells: GridCells = new Map();
  for (const { day, period, ...lesson } of grid.lessons) {
    const ids = view.kind === "class" ? lesson.classIds : lesson.teacherIds;
    if (!ids.includes(view.id)) continue;
    const key = `${day}:${period}`;
    cells.set(key, [...(cells.get(key) ?? []), lesson]);
  }
  return cells;
}
