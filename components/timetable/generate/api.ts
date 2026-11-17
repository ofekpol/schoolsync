import { sendJson } from "@/components/timetable/setup/api";
import { RunResponseSchema, StartRunResponseSchema } from "@/lib/validations/timetable-runs";
import type { Run } from "@/lib/timetable/runs";
import type { WeightProfile } from "@/lib/timetable/solver-contract";

/** Client copy of `RUN_PROFILES` (that module is server-only); keep the order in step. */
export const PROFILE_ORDER: readonly WeightProfile[] = ["teachers", "classes", "balanced"];

/** A failed call, as a key under `timetable.generate.error`. */
export type GenerateErrorKey =
  | "solver_not_configured"
  | "solver_unreachable"
  | "solver_http_error"
  | "solver_bad_output"
  | "timed_out"
  | "solver_failed"
  | "internal_error"
  | "run_in_progress"
  | "input_problems"
  | "demo"
  | "start";

const KNOWN = new Set<string>([
  "solver_not_configured", "solver_unreachable", "solver_http_error", "solver_bad_output",
  "timed_out", "solver_failed", "internal_error", "run_in_progress", "input_problems",
]);

/** A stored error code (run or profile) as a message key; unknown codes read as an internal error. */
export const errorKey = (code: string | null): GenerateErrorKey =>
  code && KNOWN.has(code) ? (code as GenerateErrorKey) : "internal_error";

const base = (board: string) => `/api/v1/timetable/boards/${board}/runs`;

export async function startRun(board: string): Promise<{ ok: true; runId: string } | { ok: false; error: GenerateErrorKey }> {
  const res = await sendJson<unknown>(base(board), "POST");
  if (!res.ok) return { ok: false, error: res.code === "demo_disabled" ? "demo" : KNOWN.has(res.code) ? (res.code as GenerateErrorKey) : "start" };
  const parsed = StartRunResponseSchema.safeParse(res.data);
  return parsed.success ? { ok: true, runId: parsed.data.runId } : { ok: false, error: "start" };
}

/** The run as the server has it, or null when the call failed (the caller keeps polling). */
export async function fetchRun(board: string, run: string): Promise<Run | null> {
  const res = await fetch(`${base(board)}/${run}`).catch(() => null);
  if (!res?.ok) return null;
  const parsed = RunResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.run : null;
}
