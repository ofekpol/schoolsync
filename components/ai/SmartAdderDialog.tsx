"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";
import type { EventType } from "@/lib/events/event-type";
import { isCandidateComplete, toPublishPayload } from "@/lib/ai/adder/complete";
import type { AdderWarning, CandidateEvent } from "@/lib/ai/adder/types";
import { SmartAdderCard } from "./SmartAdderCard";

const MAX_CHARS = 3000;
const KNOWN_ERRORS = new Set(["no_events", "quota_exceeded", "ai_unavailable", "ai_disabled", "invalid_input"]);

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the number of events published when every checked card succeeded. */
  onPublished: (count: number) => void;
  eventTypes: EventType[];
  allowedGrades: number[];
}

interface ErrorState {
  code: string;
  limit?: number;
}

async function readError(res: Response): Promise<ErrorState> {
  const body = (await res.json().catch(() => null)) as { error?: string; limit?: number } | null;
  const code = body?.error && KNOWN_ERRORS.has(body.error) ? body.error : "ai_unavailable";
  return { code, limit: body?.limit };
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Smart event adder: paste Hebrew text → review detected events → publish the checked ones. */
export function SmartAdderDialog({ open, onClose, onPublished, eventTypes, allowedGrades }: Props) {
  const t = useTranslations("aiAdder");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [candidates, setCandidates] = useState<CandidateEvent[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  // Escape and the backdrop never discard pasted text or reviewed cards.
  useEscape(open && candidates === null && !text.trim(), onClose);

  if (!open) return null;

  const isChecked = (c: CandidateEvent) => checked[c.clientId] === true && isCandidateComplete(c, allowedGrades);
  const toPublish = (candidates ?? []).filter(isChecked);

  async function detect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/ai/parse-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return setError(res ? await readError(res) : { code: "ai_unavailable" });
    const { candidates: found } = (await res.json()) as { candidates: CandidateEvent[] };
    if (found.length === 0) return setError({ code: "no_events" });
    const initial = Object.fromEntries(
      found.map((c) => [
        c.clientId,
        isCandidateComplete(c, allowedGrades) && !c.warnings.some((w) => w.code === "duplicate"),
      ]),
    );
    setChecked(initial);
    setCardErrors({});
    setCandidates(found);
  }

  const replaceCard = (next: CandidateEvent) =>
    setCandidates((list) => (list ?? []).map((x) => (x.clientId === next.clientId ? next : x)));

  /** Saves an edited card, then re-checks it against the calendar (dates may have changed). */
  async function saveCard(next: CandidateEvent) {
    replaceCard(next);
    const res = await fetch("/api/v1/ai/check-conflicts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: [next] }),
    }).catch(() => null);
    if (!res?.ok) return;
    const { warnings } = (await res.json()) as { warnings: Record<string, AdderWarning[]> };
    const fresh = warnings[next.clientId] ?? [];
    const kept = next.warnings.filter((w) => w.code !== "duplicate" && w.code !== "overlap");
    replaceCard({ ...next, warnings: [...kept, ...fresh] });
    if (fresh.some((w) => w.code === "duplicate")) setChecked((m) => ({ ...m, [next.clientId]: false }));
  }

  async function publishOne(c: CandidateEvent): Promise<boolean> {
    const res = await fetch("/api/v1/events/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPublishPayload(c, allowedGrades)),
    }).catch(() => null);
    return res?.ok === true;
  }

  async function publish() {
    setBusy(true);
    const failed: Record<string, string> = {};
    const done = new Set<string>();
    for (const c of toPublish) {
      if (await publishOne(c)) done.add(c.clientId);
      else failed[c.clientId] = t("errors.publish_failed");
    }
    setBusy(false);
    setCardErrors(failed);
    setCandidates((list) => (list ?? []).filter((c) => !done.has(c.clientId)));
    if (Object.keys(failed).length === 0) onPublished(done.size);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="smart-adder-title" dir="rtl"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 px-3 py-10">
      <div className="sg-card w-full max-w-2xl rounded-2xl">
        <header className="flex items-center justify-between border-b border-[var(--sg-hairline)] px-5 py-4">
          <h2 id="smart-adder-title" className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="size-5 text-sky-600" aria-hidden="true" />
            {t("title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("close")}
            className="grid size-8 place-items-center rounded-full hover:bg-[var(--sg-surface-2)]">
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          {candidates === null ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">{t("inputLabel")}</span>
                <textarea value={text} maxLength={MAX_CHARS} rows={7} placeholder={t("inputPlaceholder")}
                  aria-label={t("inputLabel")} onChange={(e) => setText(e.target.value)}
                  className="w-full rounded-xl border border-[var(--sg-hairline)] bg-[var(--sg-surface-2)] p-3 text-sm outline-none focus:border-sky-400 focus:bg-white" />
              </label>
              <p className="text-xs text-[var(--sg-ink-soft)]">{t("charCount", { count: text.length, max: MAX_CHARS })}</p>
            </>
          ) : (
            <>
              <p className="text-sm">{t("found", { count: candidates.length })}</p>
              {candidates.map((c) => (
                <SmartAdderCard key={c.clientId} candidate={c} eventTypes={eventTypes} allowedGrades={allowedGrades}
                  checked={checked[c.clientId] === true} error={cardErrors[c.clientId]}
                  onCheckedChange={(value) => setChecked((m) => ({ ...m, [c.clientId]: value }))}
                  onChange={(next) => void saveCard(next)} />
              ))}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {t(`errors.${error.code}`, error.limit !== undefined ? { limit: error.limit } : undefined)}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--sg-hairline)] px-5 py-3">
          {candidates === null ? (
            <button type="button" disabled={busy || !text.trim()} onClick={detect}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {busy ? t("detecting") : t("detect")}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setCandidates(null)} className="rounded-lg border border-[var(--sg-hairline)] px-4 py-2 text-sm">
                {t("backToText")}
              </button>
              <button type="button" disabled={busy || toPublish.length === 0} onClick={publish}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {t("publish", { count: toPublish.length })}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
