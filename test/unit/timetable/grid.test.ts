import { describe, expect, it } from "vitest";
import { cellsFor, type GridLesson } from "@/lib/timetable/grid";

const lesson = (blockId: string, classIds: string[], teacherIds: string[], day = 0, period = 1): GridLesson & { day: number; period: number } => ({
  blockId,
  subjectId: classIds.length > 0 ? "s" : null,
  classIds,
  teacherIds,
  day,
  period,
});

describe("cellsFor", () => {
  const lessons = [
    lesson("a", ["c1"], ["t1"], 0, 1),
    lesson("b", ["c2"], ["t1"], 0, 2),
    lesson("plata", ["c1", "c2"], ["t2"], 1, 1),
    lesson("meeting", [], ["t1", "t2"], 2, 3),
  ];

  it("class view returns only that class's lessons", () => {
    const cells = cellsFor({ lessons }, { kind: "class", id: "c1" });
    expect([...cells.keys()].sort()).toEqual(["0:1", "1:1"]);
    expect(cells.get("0:1")?.map((l) => l.blockId)).toEqual(["a"]);
  });

  it("teacher view returns only that teacher's lessons", () => {
    const cells = cellsFor({ lessons }, { kind: "teacher", id: "t2" });
    expect([...cells.keys()].sort()).toEqual(["1:1", "2:3"]);
  });

  it("a Plata block appears under every one of its classes", () => {
    for (const id of ["c1", "c2"]) {
      expect(cellsFor({ lessons }, { kind: "class", id }).get("1:1")?.map((l) => l.blockId)).toEqual(["plata"]);
    }
  });

  it("a meeting shows for its teachers and in no class view", () => {
    expect(cellsFor({ lessons }, { kind: "teacher", id: "t1" }).get("2:3")?.map((l) => l.blockId)).toEqual(["meeting"]);
    for (const id of ["c1", "c2"]) expect(cellsFor({ lessons }, { kind: "class", id }).has("2:3")).toBe(false);
  });

  it("keeps both lessons of a teacher clash in one cell", () => {
    const clash = [lesson("x", ["c1"], ["t1"], 3, 2), lesson("y", ["c2"], ["t1"], 3, 2)];
    expect(cellsFor({ lessons: clash }, { kind: "teacher", id: "t1" }).get("3:2")?.map((l) => l.blockId)).toEqual(["x", "y"]);
  });
});
