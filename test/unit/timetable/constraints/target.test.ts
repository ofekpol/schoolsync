import { describe, expect, it } from "vitest";
import { labelReach, resolveTarget } from "@/lib/timetable/constraints/target";

const teachers = [
  { id: "t1", staffUserId: "s1" },
  { id: "t2", staffUserId: "s2" },
  { id: "t3", staffUserId: null },
];
const labels = { s1: ["math"], s9: ["math"] };

describe("labelReach", () => {
  it("reaches board teachers whose staff user holds the option, and lists teachers without a login", () => {
    expect(labelReach("math", teachers, labels)).toEqual({ reachedIds: ["t1"], unlinkedIds: ["t3"] });
  });
});

describe("resolveTarget", () => {
  it("keeps only teachers on the board", () => {
    expect(resolveTarget({ kind: "teachers", teacherIds: ["t2", "gone"] }, teachers, labels)).toEqual(["t2"]);
  });

  it("turns a label into the teachers it reaches", () => {
    expect(resolveTarget({ kind: "label", optionId: "math" }, teachers, labels)).toEqual(["t1"]);
  });
});
