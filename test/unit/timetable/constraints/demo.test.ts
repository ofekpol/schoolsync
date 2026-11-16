import { describe, expect, it } from "vitest";
import { generateDemoConstraints, type DemoConstraintTeacher } from "@/lib/timetable/constraints/demo-plan";
import { ConstraintInputSchema } from "@/lib/timetable/constraints/registry";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const DAYS = [0, 1, 2, 3, 4, 5];
const teachers = (n: number, over: Partial<DemoConstraintTeacher> = {}): DemoConstraintTeacher[] =>
  Array.from({ length: n }, (_, i) => ({
    id: uuid(i + 1), staffUserId: null, freeDayEntitled: true, subjects: i < 5 ? ["מתמטיקה"] : ["אנגלית"], isAdmin: i < 3, ...over,
  }));
const MATH = uuid(999);

describe("generateDemoConstraints", () => {
  it("gives the same list for the same seed", () => {
    const input = { teachers: teachers(20), mathOptionId: MATH, days: DAYS, seed: 7 };
    expect(generateDemoConstraints(input)).toEqual(generateDemoConstraints(input));
  });

  it("gives every entitled teacher a free day, mostly on Friday or Sunday", () => {
    const list = generateDemoConstraints({ teachers: teachers(40), mathOptionId: MATH, days: DAYS, seed: 1 });
    const freeDays = list.filter((c) => c.type === "teacher_free_day");
    expect(freeDays).toHaveLength(40);
    const edge = freeDays.filter((c) => [0, 5].includes((c.params as { day: number }).day)).length;
    expect(edge / freeDays.length).toBeGreaterThanOrEqual(0.5);
  });

  it("aims the math meeting at the label, or at the math teachers without one", () => {
    const withLabel = generateDemoConstraints({ teachers: teachers(20), mathOptionId: MATH, days: DAYS, seed: 1 });
    expect(withLabel.find((c) => c.type === "meeting")?.params).toMatchObject({ target: { kind: "label", optionId: MATH } });
    const without = generateDemoConstraints({ teachers: teachers(20), mathOptionId: null, days: DAYS, seed: 1 });
    expect(without.find((c) => c.type === "meeting")?.params).toMatchObject({
      target: { kind: "teachers", teacherIds: [1, 2, 3, 4, 5].map(uuid) },
    });
  });

  it("adds a management meeting only with two or more admins", () => {
    const meetings = (list: ReturnType<typeof generateDemoConstraints>) => list.filter((c) => c.type === "meeting");
    expect(meetings(generateDemoConstraints({ teachers: teachers(20), mathOptionId: MATH, days: DAYS, seed: 1 }))).toHaveLength(2);
    const oneAdmin = teachers(20).map((x, i) => ({ ...x, isAdmin: i === 0 }));
    expect(meetings(generateDemoConstraints({ teachers: oneAdmin, mathOptionId: MATH, days: DAYS, seed: 1 }))).toHaveLength(1);
  });

  it("makes one teacher in ten unavailable and only valid inputs", () => {
    const list = generateDemoConstraints({ teachers: teachers(40), mathOptionId: MATH, days: DAYS, seed: 3 });
    expect(list.filter((c) => c.type === "teacher_unavailable")).toHaveLength(4);
    for (const c of list) expect(ConstraintInputSchema.safeParse(c).success).toBe(true);
    expect(list.map((c) => c.type)).toEqual(expect.arrayContaining(["class_no_gaps", "subject_max_per_day", "teacher_few_gaps"]));
  });
});
