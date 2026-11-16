import { describe, expect, it } from "vitest";
import { CONSTRAINT_TYPES, ConstraintInputSchema, type ExportContext } from "@/lib/timetable/constraints/registry";

const T1 = "00000000-0000-0000-0000-000000000001";
const OPT = "00000000-0000-0000-0000-000000000002";
const ctx = (over: Partial<ExportContext> = {}): ExportContext => ({
  teacherId: null,
  resolve: () => [T1],
  entitled: () => true,
  ...over,
});
const parse = (value: unknown) => ConstraintInputSchema.safeParse(value).success;

describe("CONSTRAINT_TYPES", () => {
  it("keys each type by its own name", () => {
    for (const [key, def] of Object.entries(CONSTRAINT_TYPES)) expect(def.type).toBe(key);
    expect(Object.keys(CONSTRAINT_TYPES).sort()).toEqual([
      "class_no_gaps", "meeting", "subject_max_per_day", "teacher_few_gaps", "teacher_free_day", "teacher_unavailable",
    ]);
  });

  it("skips a meeting that reaches no one", () => {
    const params = { target: { kind: "label", optionId: OPT }, weeklyPeriods: 2, consecutive: true };
    expect(CONSTRAINT_TYPES.meeting.toSolver(params, ctx({ resolve: () => [] }))).toEqual({
      kind: "skip", reason: "reaches_no_one",
    });
    expect(CONSTRAINT_TYPES.meeting.toSolver(params, ctx())).toEqual({
      kind: "block", teacherIds: [T1], weeklyPeriods: 2, consecutive: true,
    });
  });

  it("skips a free day of a teacher who is not entitled", () => {
    const part = CONSTRAINT_TYPES.teacher_free_day.toSolver({ day: 5 }, ctx({ teacherId: "t1", entitled: () => false }));
    expect(part).toEqual({ kind: "skip", reason: "not_entitled" });
    expect(CONSTRAINT_TYPES.teacher_free_day.toSolver({ day: 5 }, ctx({ teacherId: "t1" }))).toEqual({
      kind: "constraint", params: { teacherIds: ["t1"], day: 5 },
    });
  });

  it("sends unavailability with its periods only when given", () => {
    const target = { kind: "teachers", teacherIds: [T1] };
    expect(CONSTRAINT_TYPES.teacher_unavailable.toSolver({ target, day: 1 }, ctx())).toEqual({
      kind: "constraint", params: { teacherIds: [T1], day: 1 },
    });
    expect(CONSTRAINT_TYPES.teacher_unavailable.toSolver({ target, day: 1, periods: [1, 2] }, ctx())).toEqual({
      kind: "constraint", params: { teacherIds: [T1], day: 1, periods: [1, 2] },
    });
  });
});

describe("ConstraintInputSchema", () => {
  const meeting = {
    type: "meeting", hard: true, weight: 100,
    params: { target: { kind: "label", optionId: OPT }, weeklyPeriods: 2, consecutive: true },
  };

  it("accepts each type in its plain form", () => {
    expect(parse(meeting)).toBe(true);
    expect(parse({ type: "teacher_free_day", hard: true, weight: 100, teacherId: T1, params: { day: 5 } })).toBe(true);
    expect(parse({ type: "teacher_few_gaps", hard: false, weight: 10, params: {} })).toBe(true);
    expect(parse({ type: "subject_max_per_day", hard: true, weight: 50, params: { max: 2 } })).toBe(true);
  });

  it("rejects what the type does not allow", () => {
    expect(parse({ type: "teacher_few_gaps", hard: true, weight: 10, params: {} })).toBe(false);
    expect(parse({ type: "teacher_free_day", hard: true, weight: 100, params: { day: 5 } })).toBe(false);
    expect(parse({ ...meeting, teacherId: T1 })).toBe(false);
    expect(parse({ ...meeting, weight: 0 })).toBe(false);
    expect(parse({ ...meeting, params: { ...meeting.params, weeklyPeriods: 7 } })).toBe(false);
    expect(parse({ type: "teacher_unavailable", hard: true, weight: 100,
      params: { target: { kind: "teachers", teacherIds: [T1] }, day: 1, periods: [2, 2] } })).toBe(false);
  });
});
