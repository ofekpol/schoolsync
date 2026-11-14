import {
  DEMO_CURRICULUM,
  MAX_TEACHER_LOAD,
  MIN_CLASSES_FOR_PLATA,
  type CurriculumSubject,
} from "./curriculum";

/** subjects = the person's labels in the subject category. */
export interface DemoStaff {
  staffUserId: string;
  fullName: string;
  subjects: string[];
}
export interface DemoTeacher {
  key: string;
  fullName: string;
  staffUserId: string | null;
}
export interface DemoBlock {
  subject: string;
  weeklyPeriods: number;
  classes: Array<{ grade: number; number: number }>;
  teacherKeys: string[];
}
export interface DemoPlan {
  classCounts: Record<number, number>;
  subjects: string[];
  teachers: DemoTeacher[];
  blocks: DemoBlock[];
}

interface PoolTeacher extends DemoTeacher {
  subjects: string[];
  load: number;
}

/** mulberry32: a small seeded generator, so a seed always gives the same plan. */
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

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Each staff member teaches their labelled subjects, or else the least-covered one. */
function staffTeachers(staff: DemoStaff[]): PoolTeacher[] {
  const names = new Set(DEMO_CURRICULUM.map((s) => s.name));
  const covered = new Map(DEMO_CURRICULUM.map((s) => [s.name, 0]));
  const withLabels = staff.map((person) => ({ person, subjects: person.subjects.filter((s) => names.has(s)) }));
  for (const { subjects } of withLabels) for (const s of subjects) covered.set(s, (covered.get(s) ?? 0) + 1);
  return withLabels.map(({ person, subjects }) => {
    let own = subjects;
    if (own.length === 0) {
      const [fewest] = [...covered.entries()].sort((a, b) => a[1] - b[1]);
      own = [fewest[0]];
      covered.set(fewest[0], fewest[1] + 1);
    }
    return { key: `s:${person.staffUserId}`, fullName: person.fullName, staffUserId: person.staffUserId, subjects: own, load: 0 };
  });
}

/** One block per class, except a Plata subject in a large grade: all classes but the last together. */
function lessonsFor(grade: number, count: number, subject: CurriculumSubject): Array<Omit<DemoBlock, "teacherKeys">> {
  const classes = Array.from({ length: count }, (_, index) => ({ grade, number: index + 1 }));
  const base = { subject: subject.name, weeklyPeriods: subject.weeklyPeriods };
  if (subject.plata && count >= MIN_CLASSES_FOR_PLATA) {
    return [{ ...base, classes: classes.slice(0, -1) }, { ...base, classes: classes.slice(-1) }];
  }
  return classes.map((klass) => ({ ...base, classes: [klass] }));
}

/** The least-loaded teacher of the subject who still has room, or a new placeholder. */
function pickTeacher(pool: PoolTeacher[], subject: string, periods: number, taken: Set<string>): PoolTeacher {
  let best: PoolTeacher | null = null;
  for (const teacher of pool) {
    if (taken.has(teacher.key) || !teacher.subjects.includes(subject)) continue;
    if (teacher.load + periods > MAX_TEACHER_LOAD) continue;
    if (!best || teacher.load < best.load) best = teacher;
  }
  if (best) return best;
  const placeholders = pool.filter((t) => t.staffUserId === null).length;
  const extra = { key: `p:${placeholders + 1}`, fullName: `מורה נוסף ${placeholders + 1}`, staffUserId: null, subjects: [subject], load: 0 };
  pool.push(extra);
  return extra;
}

/** A full, deterministic demo board: classes, the curriculum's lessons, teachers within their load. */
export function generateDemoPlan(opts: {
  staff: DemoStaff[];
  classCounts: Record<number, number>;
  seed: number;
  anonymize: boolean;
}): DemoPlan {
  const pool = staffTeachers(shuffled(opts.staff, seededRandom(opts.seed)));
  const grades = Object.keys(opts.classCounts).map(Number).sort((a, b) => a - b);
  const blocks: DemoBlock[] = [];
  for (const grade of grades) {
    for (const subject of DEMO_CURRICULUM) {
      for (const lesson of lessonsFor(grade, opts.classCounts[grade], subject)) {
        const taken = new Set<string>();
        for (let i = 0; i < lesson.classes.length; i++) {
          const teacher = pickTeacher(pool, lesson.subject, lesson.weeklyPeriods, taken);
          teacher.load += lesson.weeklyPeriods;
          taken.add(teacher.key);
        }
        blocks.push({ ...lesson, teacherKeys: [...taken] });
      }
    }
  }
  const teachers = pool.map(({ key, fullName, staffUserId }, index) => ({
    key,
    staffUserId,
    fullName: opts.anonymize ? `מורה ${index + 1}` : fullName,
  }));
  return { classCounts: opts.classCounts, subjects: DEMO_CURRICULUM.map((s) => s.name), teachers, blocks };
}
