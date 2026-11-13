"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SERVICES, type Service } from "@/lib/services";

type Status = "idle" | "saving" | "saved" | "error";

export function SchoolServicesForm({ schoolId, services: initial }: { schoolId: string; services: Service[] }) {
  const t = useTranslations("platform.schools");
  const tc = useTranslations("common");
  const router = useRouter();
  const [saved, setSaved] = useState<Service[]>(initial);
  const [services, setServices] = useState<Service[]>(initial);
  const [status, setStatus] = useState<Status>("idle");

  const hidesService = saved.some((service) => !services.includes(service));

  async function save() {
    setStatus("saving");
    const ordered = SERVICES.filter((service) => services.includes(service));
    try {
      const res = await fetch(`/api/v1/platform/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: ordered }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setStatus("error");
      return;
    }
    setServices(ordered);
    setSaved(ordered);
    setStatus("saved");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1">{t("services.title")}</legend>
        {SERVICES.map((service) => (
          <label key={service} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={services.includes(service)}
              onChange={(e) => {
                setStatus("idle");
                setServices((prev) => (e.target.checked ? [...prev, service] : prev.filter((s) => s !== service)));
              }}
            />
            {t(`services.${service}`)}
          </label>
        ))}
      </fieldset>
      {hidesService && (
        <p role="status" className="text-sm text-amber-700">
          {t("services.hideWarning")}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={status === "saving" || services.length === 0}>
          {status === "saving" ? tc("saving") : t("services.save")}
        </Button>
        {status === "saved" && <span role="status" className="text-sm text-green-700">{t("services.saved")}</span>}
        {status === "error" && <span role="alert" className="text-sm text-red-600">{t("services.error")}</span>}
      </div>
    </div>
  );
}
