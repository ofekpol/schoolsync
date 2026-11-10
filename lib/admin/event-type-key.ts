/**
 * Builds a stable, unique event-type key from its English label.
 * Keys are internal identifiers (AI adder, demo content) that staff never
 * see, so they are derived once at creation and never edited afterwards.
 */
export function slugifyEventTypeKey(labelEn: string): string {
  const slug = labelEn
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56);
  return slug || "type";
}

/** Returns `base`, or `base_2`, `base_3`, … — the first one not in `taken`. */
export function uniqueEventTypeKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
