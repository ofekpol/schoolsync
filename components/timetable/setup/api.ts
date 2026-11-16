import type { BlockInput } from "@/lib/validations/timetable";

/** A failed call, as a key under `timetable.setup.errors`. */
export type SetupErrorKey =
  | "duplicateName"
  | "inUse"
  | "limit"
  | "noActiveYear"
  | "unknownId"
  | "mixedGrades"
  | "duplicateLesson"
  | "alreadyLinked"
  | "demo"
  | "save";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: SetupErrorKey };

const ERRORS: Record<string, SetupErrorKey> = {
  duplicate_name: "duplicateName",
  in_use: "inUse",
  limit_reached: "limit",
  no_active_year: "noActiveYear",
  unknown_id: "unknownId",
  mixed_grades: "mixedGrades",
  duplicate_lesson: "duplicateLesson",
  already_linked: "alreadyLinked",
  demo_disabled: "demo",
};

/** A JSON request; on failure, the server's `error` code (or "" when there is none). */
export async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (res?.ok) return { ok: true, data: (await res.json().catch(() => undefined)) as T };
  const payload = (await res?.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, code: payload?.error ?? "" };
}

async function send<T>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<ApiResult<T>> {
  const res = await sendJson<T>(url, method, body);
  return res.ok ? res : { ok: false, error: ERRORS[res.code] ?? "save" };
}

const boardUrl = (board: string) => `/api/v1/timetable/boards/${board}`;

export const createBoard = (name: string) =>
  send<{ board: { id: string } }>("/api/v1/timetable/boards", "POST", { name });
export const setClassCount = (board: string, grade: number, count: number) =>
  send(`${boardUrl(board)}/classes`, "PUT", { grade, count });
export const addSubjects = (board: string, names: string[]) => send(`${boardUrl(board)}/subjects`, "POST", { names });
export const renameSubject = (board: string, id: string, name: string) =>
  send(`${boardUrl(board)}/subjects/${id}`, "PATCH", { name });
export const deleteSubject = (board: string, id: string) => send(`${boardUrl(board)}/subjects/${id}`, "DELETE");
export const addTeachers = (board: string, names: string[]) => send(`${boardUrl(board)}/teachers`, "POST", { names });
export const addTeachersFromStaff = (board: string, staffUserIds: string[]) =>
  send(`${boardUrl(board)}/teachers`, "POST", { staffUserIds });
export const updateTeacher = (
  board: string,
  id: string,
  patch: { fullName?: string; freeDayEntitled?: boolean; staffUserId?: string | null },
) => send(`${boardUrl(board)}/teachers/${id}`, "PATCH", patch);
export const deleteTeacher = (board: string, id: string) => send(`${boardUrl(board)}/teachers/${id}`, "DELETE");
export const createBlock = (board: string, input: BlockInput) => send(`${boardUrl(board)}/blocks`, "POST", input);
export const replaceBlock = (board: string, id: string, input: BlockInput) =>
  send(`${boardUrl(board)}/blocks/${id}`, "PUT", input);
export const deleteBlock = (board: string, id: string) => send(`${boardUrl(board)}/blocks/${id}`, "DELETE");
