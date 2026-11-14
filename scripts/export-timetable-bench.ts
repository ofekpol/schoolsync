/**
 * Writes a solver benchmark input to solver/bench/ (git-ignored).
 *
 *   npx tsx --conditions=react-server scripts/export-timetable-bench.ts synthetic [--grades=6] [--classes=8] [--max-load=7]
 *   npx tsx --conditions=react-server scripts/export-timetable-bench.ts kfar-galim [slug]   (staging env vars loaded by the caller)
 *
 * Prints counts only: no names, no ids, no tokens.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { assertSeedTargetAllowed } from "@/db/seed";
import { DEMO_BOARD_NAME } from "@/lib/timetable/demo/curriculum";
import { generateDemoPlan } from "@/lib/timetable/demo/generate";
import { SolverInputSchema, type SolverInput } from "@/lib/timetable/solver-contract";
import { DEFAULT_WEEK } from "@/lib/timetable/week";

const OUT_DIR = "solver/bench";
const SYNTHETIC_SEED = 1;

/** A stable v4-shaped uuid, so the synthetic file is the same on every run. */
function stableId(label: string): string {
  const hex = createHash("sha256").update(label).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function syntheticInput(grades: number, classesPerGrade: number, maxLoad: number): SolverInput {
  const classCounts = Object.fromEntries(Array.from({ length: grades }, (_, i) => [7 + i, classesPerGrade]));
  const plan = generateDemoPlan({ staff: [], classCounts, seed: SYNTHETIC_SEED, anonymize: true, maxLoad });
  const classIds = Object.entries(classCounts).flatMap(([grade, count]) =>
    Array.from({ length: count }, (_, i) => stableId(`class:${grade}:${i + 1}`)),
  );
  const teacherId = (key: string): string => stableId(`teacher:${key}`);
  return SolverInputSchema.parse({
    version: 1,
    mode: "solve",
    profile: "balanced",
    timeLimitSeconds: 60,
    week: DEFAULT_WEEK,
    classIds,
    teacherIds: plan.teachers.map((t) => teacherId(t.key)),
    blocks: plan.blocks.map((block, index) => ({
      id: stableId(`block:${index}`),
      subjectId: stableId(`subject:${block.subject}`),
      weeklyPeriods: block.weeklyPeriods,
      classIds: block.classes.map((c) => stableId(`class:${c.grade}:${c.number}`)),
      teacherIds: block.teacherKeys.map(teacherId),
      consecutive: false,
    })),
    constraints: [],
    placements: [],
  });
}

async function stagingInput(slug: string): Promise<SolverInput> {
  assertSeedTargetAllowed(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [{ eq }, { db }, { schools }, { listBoards }, { buildSolverInput }] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
    import("@/lib/timetable/boards"),
    import("@/lib/timetable/export"),
  ]);
  const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.slug, slug)).limit(1);
  if (!school) throw new Error(`school "${slug}" not found`);
  const board = (await listBoards(school.id)).find((b) => b.name === DEMO_BOARD_NAME);
  if (!board) throw new Error(`board "${DEMO_BOARD_NAME}" not found`);
  const exported = await buildSolverInput(school.id, board.id);
  if (!exported) throw new Error("board not exportable");
  console.log(`problems: ${exported.problems.length}`);
  return exported.input;
}

function report(name: string, input: SolverInput): void {
  const lessons = input.blocks.reduce((sum, block) => sum + block.weeklyPeriods, 0);
  const slots = input.week.days.reduce((sum, day) => sum + day.periods.length, 0);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(input));
  console.log(`${name}: classes ${input.classIds.length}, teachers ${input.teacherIds.length}, blocks ${input.blocks.length}, lessons ${lessons}, slots/week ${slots}`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { grades: { type: "string", default: "6" }, classes: { type: "string", default: "8" }, "max-load": { type: "string", default: "7" } },
  });
  const mode = positionals[0];
  if (mode === "synthetic") report("synthetic", syntheticInput(Number(values.grades), Number(values.classes), Number(values["max-load"])));
  else if (mode === "kfar-galim") report("kfar-galim", await stagingInput(positionals[1] ?? "kfar-galim"));
  else throw new Error("usage: synthetic | kfar-galim [slug]");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
