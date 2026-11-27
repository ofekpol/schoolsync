/** Error codes the rooms API returns that have their own message under `rooms.errors`. */
const KNOWN = new Set([
  "slot_taken",
  "period_over",
  "out_of_range",
  "not_in_week",
  "no_active_year",
  "no_week",
  "not_yours",
  "room_in_use",
  "period_in_use",
  "duplicate_name",
  "invalid_staff",
  "demo_disabled",
]);

/** The `rooms.errors` key for an API error code; anything unknown is `generic`. */
export function roomsErrorKey(code: string | undefined): string {
  return code && KNOWN.has(code) ? code : "generic";
}

/** fetch + JSON for the rooms API: `{ ok: true, data }` or `{ ok: false, error }` with an errors key. */
export async function roomsFetch<T = unknown>(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: roomsErrorKey((json as { error?: string } | null)?.error) };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "generic" };
  }
}
