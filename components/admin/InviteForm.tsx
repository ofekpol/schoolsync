"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouteProgress } from "@/components/RouteProgress";
import { Check, Copy } from "lucide-react";
import { ALL_GRADES, ScopeFields } from "@/components/admin/ScopeFields";
import { Field, RoleHint, fieldClass } from "@/components/admin/staff-ui";

interface EventTypeRow {
  key: string;
  labelHe: string;
}

export function InviteForm({ eventTypes }: { eventTypes: EventTypeRow[] }) {
  const t = useTranslations("admin.staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const startRouteProgress = useRouteProgress();
  const [role, setRole] = useState<string>("editor");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function create(form: FormData) {
    setError(null);
    setUrl(null);
    setCopied(false);
    const selectedRole = String(form.get("role") ?? "editor");
    const gradeScopes =
      selectedRole === "editor"
        ? ALL_GRADES.filter((g) => form.get(`invite-grade-${g}`) === "on")
        : [];
    const eventTypeScopes =
      selectedRole === "editor"
        ? eventTypes
            .filter((et) => form.get(`invite-type-${et.key}`) === "on")
            .map((et) => et.key)
        : [];
    const body: Record<string, unknown> = {
      role: selectedRole,
      gradeScopes,
      eventTypeScopes,
      multiUse: form.get("multiUse") === "on",
    };
    const res = await fetch("/api/v1/admin/staff/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(t("createError"));
      return;
    }
    const data = (await res.json()) as { url: string };
    setUrl(data.url);
    setFormKey((k) => k + 1);
    startRouteProgress(2500);
    router.refresh();
  }

  function copyUrl(inviteUrl: string) {
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <form key={formKey} action={create} data-testid="invite-form" className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="space-y-1.5">
          <Field label={t("role")}>
            <select
              name="role"
              defaultValue="editor"
              className={`${fieldClass} sm:w-56`}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="viewer">{t("roleViewer")}</option>
              <option value="editor">{t("roleEditor")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </Field>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="multiUse" className="size-4 accent-violet-600" />
          {t("multiUse")}
        </label>
      </div>
      <RoleHint role={role} />

      {role === "editor" && (
        <ScopeFields
          eventTypes={eventTypes}
          gradeName={(grade) => `invite-grade-${grade}`}
          typeName={(key) => `invite-type-${key}`}
          labels={{
            gradeScopes: t("gradeScopes"),
            eventTypeScopes: t("eventTypeScopes"),
            selectAllGrades: t("selectAllGrades"),
            clearAllGrades: t("clearAllGrades"),
            selectAllEventTypes: t("selectAllEventTypes"),
            clearAllEventTypes: t("clearAllEventTypes"),
          }}
        />
      )}

      {url && (
        <div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <Check className="size-4" aria-hidden />
            {t("inviteCreated")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={url}
              dir="ltr"
              aria-label={t("inviteCreated")}
              onFocus={(event) => event.currentTarget.select()}
              className={`${fieldClass} min-w-0 flex-1 bg-white font-mono text-xs`}
            />
            <Button type="button" variant="outline" className="h-10" onClick={() => copyUrl(url)}>
              <Copy className="size-3.5" aria-hidden />
              {copied ? t("inviteCopied") : t("copyInvite")}
            </Button>
          </div>
          <p className="text-xs text-emerald-800">{t("inviteShareHint")}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end border-t border-neutral-100 pt-4">
        <InviteSubmitButton label={t("createInvite")} loadingLabel={tc("saving")} />
      </div>
    </form>
  );
}

function InviteSubmitButton({
  label,
  loadingLabel,
}: {
  label: string;
  loadingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="px-4">
      {pending ? loadingLabel : label}
    </Button>
  );
}
