import type { ApiResult, EventTypeDraft, EventTypeErrorKey } from "./types";

const BASE = "/api/v1/admin/event-types";

async function send<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  fallback: EventTypeErrorKey,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (res?.ok) {
    const data = (await res.json().catch(() => undefined)) as T;
    return { ok: true, data };
  }
  const payload = (await res?.json().catch(() => null)) as { error?: string } | null;
  if (payload?.error === "in_use") return { ok: false, error: "inUse" };
  if (payload?.error?.startsWith("demo_")) return { ok: false, error: "errorDemo" };
  return { ok: false, error: fallback };
}

export function createEventType(draft: EventTypeDraft) {
  return send<{ id: string; key: string }>(BASE, "POST", "errorSave", draft);
}

export function updateEventType(id: string, draft: EventTypeDraft) {
  return send(`${BASE}/${id}`, "PATCH", "errorSave", draft);
}

export function deleteEventType(id: string) {
  return send(`${BASE}/${id}`, "DELETE", "errorDelete");
}

export function reorderEventTypes(ids: string[]) {
  return send(`${BASE}/order`, "PUT", "errorReorder", { ids });
}
