import { sendJson } from "@/components/timetable/setup/api";
import type { ConstraintInput } from "@/lib/timetable/constraints/registry";

/** A failed call, as a key under `timetable.constraints.errors` (also used by the Collect page). */
export type ConstraintErrorKey =
  | "unknownId"
  | "notEntitled"
  | "duplicateFreeDay"
  | "limit"
  | "typeChanged"
  | "deadlinePast"
  | "wrongStatus"
  | "invalid"
  | "demo"
  | "save";

const ERRORS: Record<string, ConstraintErrorKey> = {
  unknown_id: "unknownId",
  not_entitled: "notEntitled",
  duplicate_free_day: "duplicateFreeDay",
  limit_reached: "limit",
  type_changed: "typeChanged",
  deadline_past: "deadlinePast",
  wrong_status: "wrongStatus",
  "Invalid input": "invalid",
  demo_disabled: "demo",
};

type Result = { ok: true } | { ok: false; error: ConstraintErrorKey };

async function call(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<Result> {
  const res = await sendJson(url, method, body);
  return res.ok ? { ok: true } : { ok: false, error: ERRORS[res.code] ?? "save" };
}

const base = (board: string) => `/api/v1/timetable/boards/${board}`;

export const createConstraint = (board: string, input: ConstraintInput) => call(`${base(board)}/constraints`, "POST", input);
export const replaceConstraint = (board: string, id: string, input: ConstraintInput) =>
  call(`${base(board)}/constraints/${id}`, "PUT", input);
export const deleteConstraint = (board: string, id: string) => call(`${base(board)}/constraints/${id}`, "DELETE");
export const setDeadline = (board: string, deadline: string) => call(`${base(board)}/collect`, "PUT", { deadline });
export const fillIn = (board: string, teacherId: string, freeDay: number | null) =>
  call(`${base(board)}/collect/${teacherId}`, "PUT", { freeDay });
