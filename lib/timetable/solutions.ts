import "server-only";
import { and, eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import { listClasses } from "./classes";
import type { SolutionGrid } from "./grid";
import { toSolutionSummary } from "./runs";
import type { SolverInput } from "./solver-contract";
import { listSubjects } from "./subjects";
import { listTeachers } from "./teachers";

type StoredInput = Pick<SolverInput, "week" | "blocks">;

/** One solution as a lesson list plus current names; null unless it belongs to this run, board and school. */
export async function getSolutionGrid(schoolId: string, boardId: string, runId: string, solutionId: string): Promise<SolutionGrid | null> {
  const found = await withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .select({ solution: ttSolutions, input: ttRuns.input, publishedSolutionId: ttBoards.publishedSolutionId })
      .from(ttSolutions)
      .innerJoin(ttRuns, eq(ttRuns.id, ttSolutions.runId))
      .innerJoin(ttBoards, eq(ttBoards.id, ttSolutions.boardId))
      .where(and(eq(ttSolutions.id, solutionId), eq(ttSolutions.runId, runId), eq(ttSolutions.boardId, boardId)));
    if (!row) return null;
    const placements = await tx.select().from(ttPlacements).where(eq(ttPlacements.solutionId, solutionId));
    return { ...row, placements };
  });
  if (!found) return null;

  const input = found.input as StoredInput;
  const blocks = new Map(input.blocks.map((block) => [block.id, block]));
  const lessons = found.placements.flatMap((p) => {
    const block = blocks.get(p.blockId);
    if (!block) return [];
    const { subjectId, classIds, teacherIds } = block;
    return [{ blockId: block.id, subjectId, classIds, teacherIds, day: p.day, period: p.period, pinned: p.pinned }];
  });
  const placedCount = new Map<string, number>();
  for (const p of found.placements) placedCount.set(p.blockId, (placedCount.get(p.blockId) ?? 0) + 1);
  const unplaced = input.blocks.flatMap((block) => {
    const missing = block.weeklyPeriods - (placedCount.get(block.id) ?? 0);
    const { subjectId, classIds, teacherIds } = block;
    return missing > 0 ? [{ blockId: block.id, subjectId, classIds, teacherIds, missing }] : [];
  });
  const [classes, teachers, subjects] = await Promise.all([
    listClasses(schoolId, boardId),
    listTeachers(schoolId, boardId),
    listSubjects(schoolId, boardId),
  ]);
  return {
    solution: toSolutionSummary(found.solution),
    week: input.week,
    lessons,
    unplaced,
    published: found.publishedSolutionId === solutionId,
    names: {
      classes: Object.fromEntries(classes.map((c) => [c.id, { grade: c.grade, number: c.number, name: c.name }])),
      teachers: Object.fromEntries(teachers.map((t) => [t.id, t.fullName])),
      subjects: Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    },
  };
}
