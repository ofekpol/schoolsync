import "server-only";
import { getBoard } from "./boards";
import { listBlocks } from "./blocks";
import { listClasses } from "./classes";
import { findInputProblems, type InputProblem } from "./input-problems";
import { SolverInputSchema, type SolverInput, type WeightProfile } from "./solver-contract";
import { listTeachers } from "./teachers";

export interface ExportOptions {
  mode?: "solve" | "evaluate";
  profile?: WeightProfile;
  timeLimitSeconds?: number;
}

const DEFAULT_TIME_LIMIT_SECONDS = 60;

/**
 * The board as solver input (ids only), with the problems that make it
 * unsolvable as entered. Null when the board is not this school's.
 */
export async function buildSolverInput(
  schoolId: string,
  boardId: string,
  opts: ExportOptions = {},
): Promise<{ input: SolverInput; problems: InputProblem[] } | null> {
  const board = await getBoard(schoolId, boardId);
  if (!board) return null;
  const [classes, teachers, blocks] = await Promise.all([
    listClasses(schoolId, boardId),
    listTeachers(schoolId, boardId),
    listBlocks(schoolId, boardId),
  ]);
  const input = SolverInputSchema.parse({
    version: 1,
    mode: opts.mode ?? "solve",
    profile: opts.profile ?? "balanced",
    timeLimitSeconds: opts.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS,
    week: board.week,
    classIds: classes.map((c) => c.id),
    teacherIds: teachers.map((t) => t.id),
    blocks: blocks.map((block) => ({ ...block, consecutive: false })),
    constraints: [], // plan 6
    placements: [], // plan 7
  });
  return { input, problems: findInputProblems(input) };
}
