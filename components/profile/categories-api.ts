import type { CategoryInput, ProfileCategory } from "@/lib/validations/profile";

export type CategoryErrorKey =
  | "errorSave"
  | "errorDuplicate"
  | "errorLimit"
  | "errorArchive"
  | "errorReorder"
  | "errorDemo";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: CategoryErrorKey };

const BASE = "/api/v1/admin/categories";

const SERVER_ERRORS: Record<string, CategoryErrorKey> = {
  duplicate_name: "errorDuplicate",
  limit_reached: "errorLimit",
  demo_disabled: "errorDemo",
};

async function send<T>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  fallback: CategoryErrorKey,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (res?.ok) {
    const data = (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;
    return { ok: true, data };
  }
  const payload = (await res?.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: SERVER_ERRORS[payload?.error ?? ""] ?? fallback };
}

export function createCategory(input: CategoryInput) {
  return send<ProfileCategory>(BASE, "POST", "errorSave", input);
}

export function replaceCategory(id: string, input: CategoryInput) {
  return send<ProfileCategory>(`${BASE}/${id}`, "PUT", "errorSave", input);
}

export function archiveCategory(id: string) {
  return send<void>(`${BASE}/${id}`, "DELETE", "errorArchive");
}

export function reorderCategories(ids: string[]) {
  return send<void>(`${BASE}/order`, "PUT", "errorReorder", { ids });
}
