"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouteProgress } from "@/components/RouteProgress";
import { Check, Copy, KeyRound } from "lucide-react";
import { ALL_GRADES, ScopeFields } from "@/components/admin/ScopeFields";
import { Field, RoleHint, fieldClass } from "@/components/admin/staff-ui";

interface EventTypeRow {
  key: string;
  labelHe: string;
}

interface CreatedStaff {
  email: string;
  temporaryPassword: string;
}

export function AddStaffForm({ eventTypes }: { eventTypes: EventTypeRow[] }) {
  const t = useTranslations("admin.staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const startRouteProgress = useRouteProgress();
  const [role, setRole] = useState<string>("editor");
  const [created, setCreated] = useState<CreatedStaff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function create(form: FormData) {
    setError(null);
    setCreated(null);
    setCopied(false);
    const selectedRole = String(form.get("role") ?? "editor");
    const gradeScopes =
      selectedRole === "editor"
        ? ALL_GRADES.filter((g) => form.get(`add-staff-grade-${g}`) === "on")
        : [];
    const eventTypeScopes =
      selectedRole === "editor"
        ? eventTypes
            .filter((et) => form.get(`add-staff-type-${et.key}`) === "on")
            .map((et) => et.key)
        : [];
    const body = {
      email: String(form.get("email") ?? "").trim(),
      fullName: String(form.get("fullName") ?? "").trim(),
      role: selectedRole,
      gradeScopes,
      eventTypeScopes,
    };

    const res = await fetch("/api/v1/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error === "duplicate_email" ? t("duplicateEmail") : t("createError"));
      return;
    }
    const data = (await res.json()) as { email: string; temporaryPassword: string };
    setCreated({ email: data.email, temporaryPassword: data.temporaryPassword });
    setFormKey((k) => k + 1);
    setRole("editor");
    startRouteProgress(2500);
    router.refresh();
  }

  function copyPassword(password: string) {
    void navigator.clipboard
      .writeText(password)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setError(t("copyPasswordError"));
      });
  }

  return (
    <form key={formKey} action={create} data-testid="add-staff-form" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fullName")}>
          <input name="fullName" type="text" required className={fieldClass} />
        </Field>
        <Field label={t("email")}>
          <input
            name="email"
            type="email"
            required
            dir="ltr"
            placeholder="name@school.org.il"
            className={fieldClass}
          />
        </Field>
      </div>
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
        <RoleHint role={role} />
      </div>

      {role === "editor" && (
        <ScopeFields
          eventTypes={eventTypes}
          gradeName={(grade) => `add-staff-grade-${grade}`}
          typeName={(key) => `add-staff-type-${key}`}
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

      {created && (
        <div
          data-testid="temp-password-panel"
          role="status"
          className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <Check className="size-4" aria-hidden />
            {t("staffCreated")}: <bdi>{created.email}</bdi>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="size-4 text-emerald-800" aria-hidden />
            <span className="text-sm text-emerald-900">{t("temporaryPassword")}:</span>
            <code className="rounded-md bg-white px-2.5 py-1 font-mono text-sm ring-1 ring-emerald-200">
              {created.temporaryPassword}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyPassword(created.temporaryPassword)}
            >
              <Copy className="size-3.5" aria-hidden />
              {copied ? t("passwordCopied") : t("copyPassword")}
            </Button>
          </div>
          <p className="text-xs text-emerald-800">
            {t("tempPasswordWarning", { email: created.email })}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end border-t border-neutral-100 pt-4">
        <AddStaffSubmitButton label={t("create")} loadingLabel={tc("saving")} />
      </div>
    </form>
  );
}

function AddStaffSubmitButton({
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
