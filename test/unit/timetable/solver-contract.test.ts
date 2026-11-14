import { describe, expect, it } from "vitest";
import { SolverInputSchema, SolverOutputSchema } from "@/lib/timetable/solver-contract";
import tiny from "@/solver/fixtures/tiny.json";

describe("solver contract", () => {
  it("the tiny fixture is a valid solver input", () => {
    expect(SolverInputSchema.safeParse(tiny).success).toBe(true);
  });
  it("rejects a block that names an unknown class", () => {
    const bad = { ...tiny, blocks: [{ ...tiny.blocks[0], classIds: ["00000000-0000-4000-8000-00000000dead"] }] };
    expect(SolverInputSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects a block that names an unknown teacher, and repeated block ids", () => {
    const badTeacher = { ...tiny, blocks: [{ ...tiny.blocks[0], teacherIds: ["00000000-0000-4000-8000-00000000dead"] }] };
    expect(SolverInputSchema.safeParse(badTeacher).success).toBe(false);
    const repeated = { ...tiny, blocks: [tiny.blocks[0], tiny.blocks[0]] };
    expect(SolverInputSchema.safeParse(repeated).success).toBe(false);
  });
  it("contains no names", () => {
    expect(JSON.stringify(tiny)).not.toMatch(/name/i);
  });
  it("accepts a solver output with a built-in violation", () => {
    const output = {
      version: 1, status: "ok", score: 3,
      placements: [{ blockId: tiny.blocks[0].id, day: 0, period: 1 }],
      violations: [{ constraintId: null, type: "unplaced", hard: true, count: 1, teacherIds: [], classIds: [] }],
    };
    expect(SolverOutputSchema.safeParse(output).success).toBe(true);
  });
});
