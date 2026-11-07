"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface ProvisionResponse {
  slug: string;
  magicLinkUrl: string;
}

const TEXT_FIELDS = ["slug", "name", "adminEmail", "adminName"] as const;

export function ProvisionSchoolForm() {
  const t = useTranslations("platform.schools");
  const tc = useTranslations("common");
  const router = useRouter();
  const [created, setCreated] = useState<ProvisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function create(form: FormData) {
    setError(null);
    setCreated(null);
    const body = Object.fromEntries(
      [...TEXT_FIELDS, "locale"].map((field) => [field, String(form.get(field) ?? "").trim()]),
    );
    const res = await fetch("/api/v1/platform/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(res.status === 409 ? t("duplicateSlug") : res.status === 400 ? t("invalid") : t("error"));
      return;
    }
    setCreated((await res.json()) as ProvisionResponse);
    setFormKey((k) => k + 1);
    router.refresh();
  }

  return (
    <form key={formKey} action={create} className="space-y-3 rounded border bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <label key={field} className="flex flex-col gap-1 text-sm">
            {t(field)}
            <input
              name={field}
              required
              type={field === "adminEmail" ? "email" : "text"}
              dir={field === "slug" || field === "adminEmail" ? "ltr" : undefined}
              pattern={field === "slug" ? "[a-z0-9-]{2,64}" : undefined}
              className="rounded border px-2 py-1"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm">
          {t("locale")}
          <select name="locale" defaultValue="he" className="rounded border px-2 py-1">
            <option value="he">{t("localeHe")}</option>
            <option value="en">{t("localeEn")}</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-neutral-600">{t("slugHint")}</p>
      <SubmitButton label={t("submit")} loadingLabel={tc("saving")} />
      {created && (
        <div role="status" className="space-y-1 text-sm text-green-700">
          <p>{t("success", { slug: created.slug })}</p>
          <p className="break-all">
            {t("magicLink")} <span dir="ltr">{created.magicLinkUrl}</span>
          </p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function SubmitButton({ label, loadingLabel }: { label: string; loadingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? loadingLabel : label}
    </Button>
  );
}
