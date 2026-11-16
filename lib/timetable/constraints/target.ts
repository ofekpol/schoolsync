import { z } from "zod";
import { MAX_TEACHERS } from "@/lib/validations/timetable";

/** Who a constraint is aimed at: a list of the board's teachers, or everyone holding a profile option. */
export type Target = { kind: "teachers"; teacherIds: string[] } | { kind: "label"; optionId: string };

export const TargetSchema: z.ZodType<Target> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("teachers"),
    teacherIds: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_TEACHERS)
      .refine((ids) => new Set(ids).size === ids.length, { message: "duplicate_id" }),
  }),
  z.object({ kind: z.literal("label"), optionId: z.string().uuid() }),
]);

type BoardTeacher = { id: string; staffUserId: string | null };

/**
 * The board teachers a label reaches (their staff user holds the option), and
 * the teachers with no staff user, who can never hold a label.
 */
export function labelReach(
  optionId: string,
  teachers: BoardTeacher[],
  labels: Record<string, string[]>,
): { reachedIds: string[]; unlinkedIds: string[] } {
  const reachedIds = teachers
    .filter((t) => t.staffUserId !== null && (labels[t.staffUserId] ?? []).includes(optionId))
    .map((t) => t.id);
  const unlinkedIds = teachers.filter((t) => t.staffUserId === null).map((t) => t.id);
  return { reachedIds, unlinkedIds };
}

/** The ids of board teachers a target covers; ids no longer on the board are dropped. */
export function resolveTarget(target: Target, teachers: BoardTeacher[], labels: Record<string, string[]>): string[] {
  if (target.kind === "label") return labelReach(target.optionId, teachers, labels).reachedIds;
  const onBoard = new Set(teachers.map((t) => t.id));
  return target.teacherIds.filter((id) => onBoard.has(id));
}
