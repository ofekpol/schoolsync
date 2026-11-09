"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const KINDS = ["bug", "question", "idea"] as const;
type Kind = (typeof KINDS)[number];
type Status = "idle" | "sending" | "sent" | "rate_limited" | "error";

export function SupportForm({ page }: { page?: string }) {
  const t = useTranslations("support");
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/v1/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, ...(page ? { page } : {}) }),
      });
      setStatus(res.ok ? "sent" : res.status === 429 ? "rate_limited" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-800">
        {t("sent")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("kindLabel")}</legend>
        <div className="flex flex-wrap gap-4">
          {KINDS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input type="radio" name="kind" value={option} checked={kind === option} onChange={() => setKind(option)} />
              {t(`kinds.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="support-message" className="text-sm font-medium">
          {t("messageLabel")}
        </label>
        <textarea
          id="support-message"
          required
          maxLength={5000}
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t(`placeholders.${kind}`)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
      </div>
      {(status === "error" || status === "rate_limited") && (
        <p role="alert" className="text-sm text-destructive">
          {t(status === "rate_limited" ? "rateLimited" : "error")}
        </p>
      )}
      <Button type="submit" disabled={status === "sending" || message.trim() === ""}>
        {status === "sending" ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
