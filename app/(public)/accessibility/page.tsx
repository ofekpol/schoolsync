import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.accessibility");
  return { title: t("title") };
}

export default async function AccessibilityPage() {
  const t = await getTranslations("legal.accessibility");
  const adjustments = t.raw("adjustments") as string[];
  return (
    <LegalPage title={t("title")}>
      <p>{t("intro")}</p>
      <LegalSection title={t("levelTitle")}>
        <p>{t("levelBody", { standard: LEGAL.conformance })}</p>
      </LegalSection>
      <LegalSection title={t("adjustmentsTitle")}>
        <ul className="list-disc space-y-1 ps-6">
          {adjustments.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </LegalSection>
      <LegalSection title={t("limitsTitle")}>
        <p>{t("limitsBody")}</p>
      </LegalSection>
      <LegalSection title={t("contactTitle")}>
        <p>{t("contactBody")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-medium">{t("nameLabel")}</dt>
          <dd>{LEGAL.a11yCoordinator.name}</dd>
          <dt className="font-medium">{t("emailLabel")}</dt>
          <dd dir="auto">{LEGAL.a11yCoordinator.email}</dd>
        </dl>
      </LegalSection>
      <p className="text-sm text-muted-foreground">{t("checked", { date: LEGAL.lastChecked })}</p>
    </LegalPage>
  );
}
