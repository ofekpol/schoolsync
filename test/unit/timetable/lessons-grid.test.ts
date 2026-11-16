import { describe, expect, it } from "vitest";
import { buildLessonsGrid, classTotals } from "@/components/timetable/setup/lessons-grid";

const classes = [
  { id: "c1", grade: 7, number: 1 },
  { id: "c2", grade: 7, number: 2 },
  { id: "c3", grade: 7, number: 3 },
];
const subjects = [{ id: "math", name: "מתמטיקה" }, { id: "eng", name: "אנגלית" }];
const lesson = { id: "b1", subjectId: "math", weeklyPeriods: 5, classIds: ["c1"], teacherIds: ["t1"] };
const plata = { id: "b2", subjectId: "eng", weeklyPeriods: 4, classIds: ["c1", "c2", "c3"], teacherIds: [] };

describe("buildLessonsGrid", () => {
  const grid = buildLessonsGrid(classes, subjects, [lesson, plata]);

  it("gives a lesson cell for a one-class block", () => {
    expect(grid.get("c1:math")).toEqual({ kind: "lesson", block: lesson });
  });

  it("gives a plata cell for each class of a several-class block", () => {
    for (const id of ["c1", "c2", "c3"]) expect(grid.get(`${id}:eng`)).toEqual({ kind: "plata", block: plata });
  });

  it("gives an empty cell where a class has no block for a subject", () => {
    expect(grid.get("c2:math")).toEqual({ kind: "empty" });
    expect(grid.size).toBe(6);
  });
});

describe("classTotals", () => {
  it("counts a Plata's periods once for each class in it", () => {
    const totals = classTotals(classes, [lesson, plata]);
    expect(totals.get("c1")).toBe(9);
    expect(totals.get("c2")).toBe(4);
    expect(totals.get("c3")).toBe(4);
  });

  it("is zero for a class without lessons", () => {
    expect(classTotals(classes, []).get("c1")).toBe(0);
  });
});
