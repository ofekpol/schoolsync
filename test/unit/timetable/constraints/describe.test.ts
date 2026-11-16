import { describe, expect, it } from "vitest";
import { describeConstraint } from "@/components/timetable/constraints/describe";
import type { TtConstraint } from "@/lib/timetable/constraints/crud";

const t = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key);
const names = {
  teacher: (id: string) => ({ t1: "דנה", t2: "יוסי" })[id] ?? "?",
  option: (id: string) => (id === "math" ? "מתמטיקה" : "?"),
  day: (d: number) => `day${d}`,
};
const row = (over: Partial<TtConstraint>): TtConstraint => ({
  id: "c", type: "class_no_gaps", hard: true, weight: 50, params: {}, source: "management", teacherId: null,
  updatedAt: "2026-11-16T00:00:00.000Z", ...over,
});

describe("describeConstraint", () => {
  it("describes a label meeting with its consecutive periods", () => {
    const text = describeConstraint(
      row({ type: "meeting", params: { target: { kind: "label", optionId: "math" }, weeklyPeriods: 2, consecutive: true } }),
      names, t,
    );
    expect(text).toBe(`describe.meeting:${JSON.stringify({ who: `describe.whoLabel:${JSON.stringify({ label: "מתמטיקה" })}`, count: 2 })} describe.consecutive`);
  });

  it("describes unavailability of two teachers in some periods", () => {
    const text = describeConstraint(
      row({ type: "teacher_unavailable", params: { target: { kind: "teachers", teacherIds: ["t1", "t2"] }, day: 0, periods: [1, 2] } }),
      names, t,
    );
    const when = `describe.periods:${JSON.stringify({ list: "1, 2" })}`;
    expect(text).toBe(`describe.teacher_unavailable:${JSON.stringify({ who: "דנה, יוסי", day: "day0", when })}`);
  });

  it("describes a free day and the board-wide rules", () => {
    expect(describeConstraint(row({ type: "teacher_free_day", teacherId: "t1", params: { day: 5 } }), names, t))
      .toBe(`describe.teacher_free_day:${JSON.stringify({ who: "דנה", day: "day5" })}`);
    expect(describeConstraint(row({ type: "subject_max_per_day", params: { max: 2 } }), names, t))
      .toBe(`describe.subject_max_per_day:${JSON.stringify({ max: 2 })}`);
    expect(describeConstraint(row({ type: "teacher_few_gaps" }), names, t)).toBe("describe.teacher_few_gaps");
  });
});
