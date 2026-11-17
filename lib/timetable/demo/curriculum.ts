/** The demo board's fixed inputs. Same curriculum for every grade: 33 of 45 slots
 * (32 for the one class outside the English Plata).
 * Subject names match the staging "מקצוע" category options, so labelled staff teach their own subject. */
export const DEMO_BOARD_NAME = "הדגמה";
export const DEMO_SUBJECT_CATEGORY = "מקצוע";

// Placeholder until Kfar Galim's real class counts are known.
export const DEMO_CLASS_COUNTS: Record<number, number> = { 7: 10, 8: 10, 9: 10, 10: 10, 11: 10, 12: 10 };

export const MAX_TEACHER_LOAD = 22;

export interface CurriculumSubject {
  name: string;
  weeklyPeriods: number;
  plata: boolean;
  /** A Plata subject only: weekly periods of the one class outside the Plata (default: weeklyPeriods). */
  soloPeriods?: number;
  /** How the demo names this subject's teachers, numbered: "<title> 1", "<title> 2"... Default: "מורה ל<name>". */
  teacherTitle?: string;
}

/** The name prefix of a subject's demo teachers. */
export const teacherTitle = (subject: CurriculumSubject): string => subject.teacherTitle ?? `מורה ל${subject.name}`;

export const DEMO_CURRICULUM: CurriculumSubject[] = [
  { name: "מתמטיקה", weeklyPeriods: 5, plata: true },
  { name: "אנגלית", weeklyPeriods: 4, plata: true, soloPeriods: 3 },
  { name: "ביולוגיה", weeklyPeriods: 2, plata: false },
  { name: "כימיה", weeklyPeriods: 2, plata: false },
  { name: "מדעי המחשב", weeklyPeriods: 2, plata: false },
  { name: "עברית", weeklyPeriods: 3, plata: false },
  { name: "ספרות", weeklyPeriods: 2, plata: false },
  { name: "היסטוריה", weeklyPeriods: 2, plata: false },
  { name: 'תנ"ך', weeklyPeriods: 2, plata: false },
  { name: "אזרחות", weeklyPeriods: 2, plata: false },
  { name: "גאוגרפיה", weeklyPeriods: 2, plata: false },
  { name: "ספורט", weeklyPeriods: 2, plata: false },
  { name: "אמנות", weeklyPeriods: 2, plata: false },
  { name: "חינוך", weeklyPeriods: 1, plata: false, teacherTitle: "מחנך/ת" },
];

/** A Plata subject is split this way only in a grade with at least this many classes. */
export const MIN_CLASSES_FOR_PLATA = 3;
