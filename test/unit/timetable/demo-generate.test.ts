import { describe, expect, it } from "vitest";
import { DEMO_CURRICULUM, MAX_TEACHER_LOAD } from "@/lib/timetable/demo/curriculum";
import { generateDemoPlan, type DemoPlan, type DemoStaff } from "@/lib/timetable/demo/generate";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const labels = ["מתמטיקה", "מתמטיקה", "מתמטיקה", "אנגלית", "אנגלית"];
const staff: DemoStaff[] = Array.from({ length: 10 }, (_, i) => ({
  staffUserId: id(i + 1),
  fullName: `שם אמיתי ${i + 1}`,
  subjects: labels[i] ? [labels[i]] : [],
}));
const classCounts = { 7: 3, 8: 2 };
const CURRICULUM_PERIODS = DEMO_CURRICULUM.reduce((sum, s) => sum + s.weeklyPeriods, 0);
const ENGLISH = DEMO_CURRICULUM.find((s) => s.name === "אנגלית")!;
const plan = (overrides: Partial<Parameters<typeof generateDemoPlan>[0]> = {}): DemoPlan =>
  generateDemoPlan({ staff, classCounts, seed: 1, ...overrides });

function loads(p: DemoPlan): Map<string, number> {
  const totals = new Map<string, number>();
  for (const block of p.blocks) for (const key of block.teacherKeys) totals.set(key, (totals.get(key) ?? 0) + block.weeklyPeriods);
  return totals;
}

describe("generateDemoPlan", () => {
  it("is deterministic per seed", () => {
    expect(plan()).toEqual(plan());
    expect(plan({ seed: 2 }).teachers.map((t) => t.key)).not.toEqual(plan().teachers.map((t) => t.key));
  });

  it("keeps a math-labelled teacher in math blocks only", () => {
    const mathKey = `s:${staff[0].staffUserId}`;
    const subjects = new Set(plan().blocks.filter((b) => b.teacherKeys.includes(mathKey)).map((b) => b.subject));
    expect([...subjects]).toEqual(["מתמטיקה"]);
  });

  it("splits a Plata subject only in a grade with 3 or more classes", () => {
    const math = (grade: number) => plan().blocks.filter((b) => b.subject === "מתמטיקה" && b.classes[0].grade === grade);
    expect(math(7).map((b) => [b.classes.map((c) => c.number), b.teacherKeys.length])).toEqual([[[1, 2], 2], [[3], 1]]);
    expect(math(8).map((b) => b.classes.map((c) => c.number))).toEqual([[1], [2]]);
  });

  it("stays within the teacher load, staffs every block and gives every class the full curriculum", () => {
    const p = plan();
    expect(Math.max(...loads(p).values())).toBeLessThanOrEqual(MAX_TEACHER_LOAD);
    expect(p.blocks.every((b) => b.teacherKeys.length >= 1)).toBe(true);
    const perClass = new Map<string, number>();
    for (const b of p.blocks) for (const c of b.classes) perClass.set(`${c.grade}:${c.number}`, (perClass.get(`${c.grade}:${c.number}`) ?? 0) + b.weeklyPeriods);
    expect(perClass.size).toBe(5);
    // 7:3 learns English outside the Plata, with its own periods.
    const outside = CURRICULUM_PERIODS - ENGLISH.weeklyPeriods + ENGLISH.soloPeriods!;
    expect(Object.fromEntries(perClass)).toEqual({ "7:1": CURRICULUM_PERIODS, "7:2": CURRICULUM_PERIODS, "7:3": outside,
      "8:1": CURRICULUM_PERIODS, "8:2": CURRICULUM_PERIODS });
  });

  it("gives the class outside the English Plata its own weekly periods", () => {
    const english = plan().blocks.filter((b) => b.subject === "אנגלית" && b.classes[0].grade === 7);
    expect(english.map((b) => [b.classes.map((c) => c.number), b.weeklyPeriods])).toEqual([
      [[1, 2], ENGLISH.weeklyPeriods],
      [[3], ENGLISH.soloPeriods],
    ]);
  });

  it("names teachers by subject, numbered, and keeps the staff links", () => {
    const p = plan();
    const text = JSON.stringify(p);
    expect(staff.some((s) => text.includes(s.fullName))).toBe(false);
    expect(p.teachers.filter((t) => t.staffUserId).map((t) => t.staffUserId).sort()).toEqual(staff.map((s) => s.staffUserId).sort());
    const math = p.teachers.filter((t) => t.fullName.startsWith("מורה למתמטיקה ")).map((t) => t.fullName);
    expect(math.slice(0, 3)).toEqual(["מורה למתמטיקה 1", "מורה למתמטיקה 2", "מורה למתמטיקה 3"]);
    expect(p.teachers.some((t) => t.fullName.startsWith("מחנך/ת "))).toBe(true);
    expect(new Set(p.teachers.map((t) => t.fullName)).size).toBe(p.teachers.length);
  });

  it("names a teacher after the subject they teach", () => {
    const p = plan();
    const name = new Map(p.teachers.map((t) => [t.key, t.fullName]));
    for (const block of p.blocks) {
      const first = p.blocks.find((b) => b.teacherKeys.includes(block.teacherKeys[0]))!;
      expect(name.get(block.teacherKeys[0])).toMatch(first.subject === "חינוך" ? /^מחנך\/ת \d+$/ : new RegExp(`^מורה ל${first.subject} \\d+$`));
    }
  });

  it("covers every lesson with placeholders when there is no staff", () => {
    const p = plan({ staff: [] });
    expect(p.teachers.length).toBeGreaterThan(0);
    expect(p.teachers.every((t) => t.staffUserId === null)).toBe(true);
    expect(p.blocks.every((b) => b.teacherKeys.length >= 1)).toBe(true);
  });
});
