"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouteProgress } from "@/components/RouteProgress";
import { ALL_GRADES, ScopeFields } from "@/components/admin/ScopeFields";

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
    <form
      key={formKey}
      action={create}
      data-testid="invite-form"
      className="space-y-3 rounded border p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <select
          name="role"
          defaultValue="editor"
          className="rounded border px-2 py-1"
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="viewer">{t("roleViewer")}</option>
          <option value="editor">{t("roleEditor")}</option>
          <option value="admin">{t("roleAdmin")}</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="multiUse" />
          {t("multiUse")}
        </label>
        <InviteSubmitButton label={t("createInvite")} loadingLabel={tc("saving")} />
      </div>

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
          wrapperClassName="lg:grid-cols-1 xl:grid-cols-2"
          legendClassName="text-neutral-950"
          optionClassName="rounded-none border-0 px-0 py-0"
        />
      )}

      {url && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all text-sm text-green-700">
            {t("inviteCreated")}: {url}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copyUrl(url)}
          >
            {copied ? t("inviteCopied") : t("copyInvite")}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
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
    <Button type="submit" disabled={pending}>
      {pending ? loadingLabel : label}
    </Button>
  );
}
