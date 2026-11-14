/** The demo board's fixed inputs. Same curriculum for every grade: 31 of 45 slots. */
export const DEMO_BOARD_NAME = "הדגמה";
export const DEMO_SUBJECT_CATEGORY = "מקצוע";

// Placeholder until Kfar Galim's real class counts are known.
export const DEMO_CLASS_COUNTS: Record<number, number> = { 7: 10, 8: 10, 9: 10, 10: 10, 11: 10, 12: 10 };

export const MAX_TEACHER_LOAD = 22;

export interface CurriculumSubject {
  name: string;
  weeklyPeriods: number;
  plata: boolean;
}

export const DEMO_CURRICULUM: CurriculumSubject[] = [
  { name: "מתמטיקה", weeklyPeriods: 5, plata: true },
  { name: "אנגלית", weeklyPeriods: 4, plata: true },
  { name: "מדעים", weeklyPeriods: 4, plata: false },
  { name: "עברית", weeklyPeriods: 3, plata: false },
  { name: "ספרות", weeklyPeriods: 2, plata: false },
  { name: "היסטוריה", weeklyPeriods: 2, plata: false },
  { name: 'תנ"ך', weeklyPeriods: 2, plata: false },
  { name: "אזרחות", weeklyPeriods: 2, plata: false },
  { name: "גאוגרפיה", weeklyPeriods: 2, plata: false },
  { name: "חינוך גופני", weeklyPeriods: 2, plata: false },
  { name: "אמנות", weeklyPeriods: 2, plata: false },
  { name: "חינוך", weeklyPeriods: 1, plata: false },
];

/** A Plata subject is split this way only in a grade with at least this many classes. */
export const MIN_CLASSES_FOR_PLATA = 3;
