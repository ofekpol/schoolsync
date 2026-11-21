/** A class's display name: its own name, else the grade's letter plus its number ("ז1"). */
export function className(
  klass: { grade: number; number: number; name?: string | null },
  gradeLabel: (grade: number) => string,
): string {
  return klass.name || `${gradeLabel(klass.grade)}${klass.number}`;
}
