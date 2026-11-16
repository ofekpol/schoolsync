import type { ConstraintInput } from "./registry";
import type { Target } from "./target";

/** A board teacher as the demo needs it: subjects come from the board's lessons. */
export interface DemoConstraintTeacher {
  id: string;
  staffUserId: string | null;
  freeDayEntitled: boolean;
  subjects: string[];
  /** Their staff user is a school admin (the management meeting). */
  isAdmin: boolean;
}

const MATH = "מתמטיקה";
const FRIDAY = 5;
const SUNDAY = 0;
const UNAVAILABLE_SHARE = 0.1;

/** mulberry32, as in lib/timetable/demo/generate.ts: a seed always gives the same list. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Friday 0.4, Sunday 0.3, the other teaching days share 0.3: some free days must be broken. */
function freeDayPicker(days: number[], random: () => number): () => number {
  const others = days.filter((d) => d !== FRIDAY && d !== SUNDAY);
  const weighted: Array<[number, number]> = [
    ...(days.includes(FRIDAY) ? [[FRIDAY, 0.4] as [number, number]] : []),
    ...(days.includes(SUNDAY) ? [[SUNDAY, 0.3] as [number, number]] : []),
    ...others.map((d) => [d, 0.3 / Math.max(others.length, 1)] as [number, number]),
  ];
  const total = weighted.reduce((sum, [, w]) => sum + w, 0);
  return () => {
    let roll = random() * total;
    for (const [day, weight] of weighted) if ((roll -= weight) < 0) return day;
    return weighted[weighted.length - 1][0];
  };
}

const meeting = (target: Target): ConstraintInput => ({
  type: "meeting", hard: true, weight: 100, params: { target, weeklyPeriods: 2, consecutive: true },
});

/**
 * The demo board's constraints: a two-period math meeting (by label when the
 * school has it), a management meeting, one teacher in ten unavailable on a
 * day, a free day per entitled teacher, and three board-wide rules.
 */
export function generateDemoConstraints(input: {
  teachers: DemoConstraintTeacher[];
  mathOptionId: string | null;
  days: number[];
  seed: number;
}): ConstraintInput[] {
  const random = seededRandom(input.seed);
  const out: ConstraintInput[] = [];
  const math = input.teachers.filter((t) => t.subjects.includes(MATH)).map((t) => t.id);
  if (input.mathOptionId) out.push(meeting({ kind: "label", optionId: input.mathOptionId }));
  else if (math.length >= 2) out.push(meeting({ kind: "teachers", teacherIds: math }));
  const admins = input.teachers.filter((t) => t.isAdmin).map((t) => t.id);
  if (admins.length >= 2) out.push(meeting({ kind: "teachers", teacherIds: admins }));

  const pick = (list: number[]) => list[Math.floor(random() * list.length)];
  const shuffled = [...input.teachers].sort(() => random() - 0.5);
  for (const teacher of shuffled.slice(0, Math.round(input.teachers.length * UNAVAILABLE_SHARE))) {
    out.push({ type: "teacher_unavailable", hard: true, weight: 100,
      params: { target: { kind: "teachers", teacherIds: [teacher.id] }, day: pick(input.days) } });
  }
  const freeDay = freeDayPicker(input.days, random);
  for (const teacher of input.teachers.filter((t) => t.freeDayEntitled)) {
    out.push({ type: "teacher_free_day", hard: true, weight: 100, teacherId: teacher.id, params: { day: freeDay() } });
  }
  out.push(
    { type: "class_no_gaps", hard: true, weight: 50, params: {} },
    { type: "subject_max_per_day", hard: true, weight: 50, params: { max: 2 } },
    { type: "teacher_few_gaps", hard: false, weight: 10, params: {} },
  );
  return out;
}
