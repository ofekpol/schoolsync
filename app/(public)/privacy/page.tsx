import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage, LegalSection, type LegalSectionText } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: t("title") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  const sections = t.raw("sections") as LegalSectionText[];
  return (
    <LegalPage title={t("title")}>
      <p>{t("intro")}</p>
      {sections.map((section) => (
        <LegalSection key={section.title} title={section.title}>
          <p>{section.body.replace("{company}", `${LEGAL.companyName} (${LEGAL.idLabel} ${LEGAL.companyNumber})`)}</p>
        </LegalSection>
      ))}
      <p>
        {t("contactLabel")} <span dir="auto">{LEGAL.contactEmail}</span>
      </p>
      <p className="text-sm text-muted-foreground">{t("updated", { date: LEGAL.updated })}</p>
    </LegalPage>
  );
}
