"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, LoaderCircle, Lock, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { SupportKindPicker, type SupportKind } from "./SupportKindPicker";
import { SupportSent } from "./SupportSent";

const MAX_LENGTH = 5000;
type Status = "idle" | "sending" | "sent" | "rate_limited" | "error";

async function sendRequest(kind: SupportKind, message: string, page?: string): Promise<Status> {
  try {
    const res = await fetch("/api/v1/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, message, ...(page ? { page } : {}) }),
    });
    return res.ok ? "sent" : res.status === 429 ? "rate_limited" : "error";
  } catch {
    return "error";
  }
}

export function SupportForm({ page }: { page?: string }) {
  const t = useTranslations("support");
  const [kind, setKind] = useState<SupportKind>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setStatus(await sendRequest(kind, message, page));
  }

  if (status === "sent") {
    return (
      <SupportSent
        page={page}
        onSendAnother={() => {
          setMessage("");
          setStatus("idle");
        }}
      />
    );
  }

  const sending = status === "sending";
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SupportKindPicker value={kind} onChange={setKind} />
      <MessageField kind={kind} value={message} onChange={setMessage} />
      {(status === "error" || status === "rate_limited") && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {t(status === "rate_limited" ? "rateLimited" : "error")}
        </p>
      )}
      <button
        type="submit"
        disabled={sending || message.trim() === ""}
        className="sg-button-primary inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {sending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4 rtl:-scale-x-100" />}
        {sending ? t("sending") : t("submit")}
      </button>
    </form>
  );
}

interface MessageFieldProps {
  kind: SupportKind;
  value: string;
  onChange: (value: string) => void;
}

function MessageField({ kind, value, onChange }: MessageFieldProps) {
  const t = useTranslations("support");
  return (
    <div className="space-y-2">
      <label htmlFor="support-message" className="block text-sm font-semibold text-neutral-800">
        {t("messageLabel")}
      </label>
      <textarea
        id="support-message"
        required
        maxLength={MAX_LENGTH}
        rows={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t(`placeholders.${kind}`)}
        aria-describedby="support-privacy"
        className="block w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-relaxed shadow-sm placeholder:text-neutral-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
      />
      <div className="flex items-start justify-between gap-4 text-xs text-neutral-500">
        <p id="support-privacy" className="flex items-start gap-1.5">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t("privacyNote")}
        </p>
        <span
          aria-hidden
          className={cn("shrink-0 tabular-nums", value.length > MAX_LENGTH * 0.9 && "text-amber-600")}
        >
          {t("charCount", { count: value.length, max: MAX_LENGTH })}
        </span>
      </div>
    </div>
  );
}
