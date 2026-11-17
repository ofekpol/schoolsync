/**
 * Fills the timeTable demo board ("הדגמה") of one school from its staff and
 * their subject labels. Teachers are named by subject ("מורה למתמטיקה 1"), never by person. Local or staging databases only; other boards are untouched.
 *
 *   pnpm seed:timetable-demo [slug] [--seed=<n>] [--subject-category=<name>]
 *
 * Prints counts only: no names, no tokens.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { assertSeedTargetAllowed } from "@/db/seed";
import { db } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { hasService } from "@/lib/services";
import { DEMO_CLASS_COUNTS, DEMO_SUBJECT_CATEGORY } from "@/lib/timetable/demo/curriculum";
import { generateDemoPlan, type DemoPlan } from "@/lib/timetable/demo/generate";
import { loadDemoStaff, writeDemoBoard } from "@/lib/timetable/demo/write";
import { writeDemoConstraints } from "@/lib/timetable/constraints/demo";
import { buildSolverInput } from "@/lib/timetable/export";

interface SeedArgs {
  slug: string;
  seed: number;
  subjectCategory: string;
}

export function parseSeedArgs(argv: string[]): SeedArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      seed: { type: "string", default: "1" },
      "subject-category": { type: "string", default: DEMO_SUBJECT_CATEGORY },
    },
  });
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");
  return { slug: positionals[0] ?? "kfar-galim", seed, subjectCategory: values["subject-category"] };
}

function teacherCounts(plan: DemoPlan): { linked: number; placeholder: number } {
  const linked = plan.teachers.filter((t) => t.staffUserId !== null).length;
  return { linked, placeholder: plan.teachers.length - linked };
}

async function main(args: SeedArgs): Promise<void> {
  assertSeedTargetAllowed(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [school] = await db
    .select({ id: schools.id, services: schools.services })
    .from(schools)
    .where(eq(schools.slug, args.slug))
    .limit(1);
  if (!school) throw new Error(`school "${args.slug}" not found`);

  const staff = await loadDemoStaff(school.id, args.subjectCategory);
  const plan = generateDemoPlan({ staff, classCounts: DEMO_CLASS_COUNTS, seed: args.seed });
  const { boardId } = await writeDemoBoard(school.id, plan);
  const demoConstraints = await writeDemoConstraints(school.id, boardId, args.seed); // plan 6
  const exported = await buildSolverInput(school.id, boardId);
  const { linked, placeholder } = teacherCounts(plan);

  console.log(`classes:  ${exported?.input.classIds.length ?? 0}`);
  console.log(`subjects: ${plan.subjects.length}`);
  console.log(`teachers: ${plan.teachers.length} (linked ${linked}, placeholder ${placeholder}, linked without a subject label ${staff.filter((s) => s.subjects.length === 0).length})`);
  console.log(`blocks:   ${plan.blocks.length}`);
  console.log(`constraints: ${demoConstraints.written} (skipped ${demoConstraints.skipped})`);
  console.log(`problems: ${exported?.problems.length ?? "board not found"}`);
  if (!hasService(school, "timetable")) {
    console.warn(`warning: "${args.slug}" does not have the timetable service; turn it on at /platform/schools`);
  }
}

const invokedAsScript = /[\\/]scripts[\\/]seed-timetable-demo\.ts$/.test(process.argv[1] ?? "");
if (invokedAsScript) {
  main(parseSeedArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
