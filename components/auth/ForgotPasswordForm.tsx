"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-800">
        {t("sent")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="forgot-email" className="text-sm font-medium">
          {t("email")}
        </label>
        <input
          id="forgot-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          dir="ltr"
        />
      </div>
      {state === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {state === "sending" ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
