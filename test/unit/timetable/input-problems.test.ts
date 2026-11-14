import { describe, expect, it } from "vitest";
import { findInputProblems } from "@/lib/timetable/input-problems";
import { SolverInputSchema, type SolverInput } from "@/lib/timetable/solver-contract";
import fixture from "@/solver/fixtures/tiny.json";

const tiny: SolverInput = SolverInputSchema.parse(fixture);

describe("findInputProblems", () => {
  it("reports nothing for the tiny fixture", () => {
    expect(findInputProblems(tiny)).toEqual([]);
  });
  it("reports a block with no teacher", () => {
    const input = { ...tiny, blocks: [{ ...tiny.blocks[0], teacherIds: [] }, ...tiny.blocks.slice(1)] };
    expect(findInputProblems(input)).toContainEqual({ code: "block_without_teacher", blockId: tiny.blocks[0].id });
  });
  it("reports a class with more periods than the week has slots", () => {
    const big = { ...tiny.blocks[0], id: crypto.randomUUID(), weeklyPeriods: 12 };
    const input = { ...tiny, blocks: [...tiny.blocks, ...[1, 2, 3, 4].map(() => ({ ...big, id: crypto.randomUUID() }))] };
    expect(findInputProblems(input).some((p) => p.code === "class_overbooked" && p.slots === 45)).toBe(true);
  });
  it("reports a teacher with more periods than the week has slots", () => {
    const teacherId = tiny.teacherIds[2];
    const big = { ...tiny.blocks[1], teacherIds: [teacherId], weeklyPeriods: 12 };
    const input = { ...tiny, blocks: [...tiny.blocks, ...[1, 2, 3, 4, 5].map(() => ({ ...big, id: crypto.randomUUID() }))] };
    expect(findInputProblems(input)).toContainEqual({ code: "teacher_overbooked", teacherId, periods: 68, slots: 45 });
  });
});
