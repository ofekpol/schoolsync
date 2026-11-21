import type { Week } from "./week";
import type { SolutionSummary } from "./runs";

export interface GridLesson {
  blockId: string;
  subjectId: string | null;
  classIds: string[];
  teacherIds: string[];
}
export interface Slot {
  day: number;
  period: number;
}
export type PlacedLesson = GridLesson & Slot & { pinned: boolean };
export interface SolutionGrid {
  solution: SolutionSummary;
  week: Week;
  lessons: PlacedLesson[];
  unplaced: Array<GridLesson & { missing: number }>; // blocks with fewer rows than weeklyPeriods
  published: boolean; // this solution is the board's published one
  names: {
    classes: Record<string, { grade: number; number: number; name: string | null }>;
    teachers: Record<string, string>;
    subjects: Record<string, string>;
  };
}
export type GridView = { kind: "class" | "teacher"; id: string };
export type GridCells = Map<string, Array<GridLesson & { pinned: boolean }>>; // key `${day}:${period}`

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

export interface SlotConflict {
  teacherIds: string[];
  classIds: string[];
}

/** Who else is busy at `slot` among `lesson`'s teachers and classes, ignoring `lesson` at `ignore`. */
export function conflictsAt(lessons: PlacedLesson[], lesson: GridLesson, slot: Slot, ignore?: Slot): SlotConflict {
  const teacherIds = new Set<string>();
  const classIds = new Set<string>();
  for (const other of lessons) {
    if (other.day !== slot.day || other.period !== slot.period) continue;
    if (other.blockId === lesson.blockId && ignore && other.day === ignore.day && other.period === ignore.period) continue;
    other.teacherIds.filter((id) => lesson.teacherIds.includes(id)).forEach((id) => teacherIds.add(id));
    other.classIds.filter((id) => lesson.classIds.includes(id)).forEach((id) => classIds.add(id));
  }
  return { teacherIds: [...teacherIds], classIds: [...classIds] };
}

export function slotInWeek(week: Week, slot: Slot): boolean {
  const day = week.days.find((d) => d.day === slot.day);
  return !!day && day.periods.some((p) => p.period === slot.period);
}
