/** A class's display name: the grade's letter plus its number ("ז1"). */
export function className(grade: number, number: number, gradeLabel: (grade: number) => string): string {
  return `${gradeLabel(grade)}${number}`;
}
