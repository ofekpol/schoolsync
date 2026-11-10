"use client";

import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { ArrowRight, CircleCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Page the user came from; offers a way back when known. */
  page?: string;
  onSendAnother: () => void;
}

/** Thank-you card shown after a request is sent. */
export function SupportSent({ page, onSendAnother }: Props) {
  const t = useTranslations("support");
  // Same-origin paths only: "//host" or "/\host" would leave the app.
  const backHref = page && /^\/(?![/\\])/.test(page) ? page : undefined;
  return (
    <div role="status" className="flex flex-col items-center gap-4 px-2 py-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CircleCheck aria-hidden className="size-8" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-neutral-900">{t("sentTitle")}</h2>
        <p className="text-sm text-neutral-600">{t("sent")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {backHref && (
          <Link
            href={backHref as Route}
            className="sg-button-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium"
          >
            <ArrowRight aria-hidden className="size-4 ltr:rotate-180" />
            {t("back")}
          </Link>
        )}
        <Button type="button" variant="outline" className="h-10 px-4" onClick={onSendAnother}>
          <RotateCcw aria-hidden />
          {t("sendAnother")}
        </Button>
      </div>
    </div>
  );
}
