import { sendJson } from "@/components/timetable/setup/api";
import { EvaluateResponseSchema, StartRunResponseSchema, type PlacementEdit } from "@/lib/validations/timetable-runs";
import type { SolutionSummary } from "@/lib/timetable/runs";

/** A failed call, as a key under `timetable.edit.error`. */
export type EditErrorKey =
  | "not_in_week" | "slot_taken" | "fully_placed" | "solution_failed" | "moved_elsewhere"
  | "evaluate_unsupported" | "solver_failed" | "placements_changed" | "unknown_id"
  | "run_in_progress" | "input_problems"
  | "solver_not_configured" | "solver_unreachable" | "solver_http_error" | "solver_bad_output"
  | "internal_error";

export type EditResult<T = object> = ({ ok: true } & T) | { ok: false; error: EditErrorKey };

const KNOWN = new Set<string>([
  "not_in_week", "slot_taken", "fully_placed", "solution_failed", "evaluate_unsupported", "solver_failed",
  "placements_changed", "unknown_id", "run_in_progress", "input_problems",
  "solver_not_configured", "solver_unreachable", "solver_http_error", "solver_bad_output",
]);

/** 404 means the row or option is gone; `gone` names which message that is. */
const toError = (res: { code: string; status: number }, gone: EditErrorKey): EditErrorKey =>
  res.status === 404 ? gone : KNOWN.has(res.code) ? (res.code as EditErrorKey) : "internal_error";

const solutionUrl = (board: string, run: string, solution: string) =>
  `/api/v1/timetable/boards/${board}/runs/${run}/solutions/${solution}`;

export async function editPlacement(board: string, run: string, solution: string, edit: PlacementEdit): Promise<EditResult> {
  const res = await sendJson(`${solutionUrl(board, run, solution)}/placements`, "PATCH", edit);
  return res.ok ? { ok: true } : { ok: false, error: toError(res, "moved_elsewhere") };
}

export async function evaluate(board: string, run: string, solution: string): Promise<EditResult<{ solution: SolutionSummary }>> {
  const res = await sendJson<unknown>(`${solutionUrl(board, run, solution)}/evaluate`, "POST");
  if (!res.ok) return { ok: false, error: toError(res, "unknown_id") };
  const parsed = EvaluateResponseSchema.safeParse(res.data);
  return parsed.success ? { ok: true, solution: parsed.data.solution } : { ok: false, error: "internal_error" };
}

export async function publish(board: string, run: string, solution: string): Promise<EditResult> {
  const res = await sendJson(`${solutionUrl(board, run, solution)}/publish`, "POST");
  return res.ok ? { ok: true } : { ok: false, error: toError(res, "unknown_id") };
}

/** Starts a new run that keeps this solution's pinned lessons. */
export async function regenerate(board: string, fromSolutionId: string): Promise<EditResult<{ runId: string }>> {
  const res = await sendJson<unknown>(`/api/v1/timetable/boards/${board}/runs`, "POST", { fromSolutionId });
  if (!res.ok) return { ok: false, error: toError(res, "unknown_id") };
  const parsed = StartRunResponseSchema.safeParse(res.data);
  return parsed.success ? { ok: true, runId: parsed.data.runId } : { ok: false, error: "internal_error" };
}
