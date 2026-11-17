import { describe, expect, it } from "vitest";
import { buildLessonsGrid, classTotals, gradeNorms } from "@/components/timetable/setup/lessons-grid";

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

describe("gradeNorms", () => {
  const block = (id: string, subjectId: string, weeklyPeriods: number, classIds: string[]) =>
    ({ id, subjectId, weeklyPeriods, classIds, teacherIds: [] });

  it("takes the value most classes have, counting a Plata for each of its classes", () => {
    const blocks = [block("a", "math", 3, ["c1"]), block("b", "math", 3, ["c2"]), block("c", "math", 5, ["c3"]),
      block("d", "eng", 4, ["c1", "c2"]), block("e", "eng", 2, ["c3"])];
    const norms = gradeNorms(classes, subjects, buildLessonsGrid(classes, subjects, blocks));
    expect(norms.get("math")).toBe(3);
    expect(norms.get("eng")).toBe(4);
  });

  it("counts an empty cell as 0 and breaks a tie by the first class", () => {
    const blocks = [block("a", "math", 2, ["c2"])];
    expect(gradeNorms(classes, subjects, buildLessonsGrid(classes, subjects, blocks)).get("math")).toBe(0);
    const tie = [block("a", "math", 2, ["c1"]), block("b", "math", 6, ["c2"])];
    expect(gradeNorms(classes.slice(0, 2), subjects, buildLessonsGrid(classes, subjects, tie)).get("math")).toBe(2);
  });
});
