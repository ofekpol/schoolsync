/** Every grade a school event can target, in display order. */
export const SCHOOL_GRADES = [7, 8, 9, 10, 11, 12] as const;

export const HEBREW_GRADE_LABELS = {
  7: "ז",
  8: "ח",
  9: "ט",
  10: "י",
  11: "יא",
  12: "יב",
} as const;

export type IsraeliGrade = keyof typeof HEBREW_GRADE_LABELS;

export function formatGradeLabel(grade: number): string {
  return HEBREW_GRADE_LABELS[grade as IsraeliGrade] ?? String(grade);
}

export function formatGradeList(grades: number[]): string {
  return grades.map(formatGradeLabel).join(", ");
}
