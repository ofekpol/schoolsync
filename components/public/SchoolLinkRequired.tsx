import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, Link2, MessageCircle, School } from "lucide-react";

/**
 * Guest entry without a valid school link. Deliberately reveals nothing about
 * which schools exist — the secret link is the only way to a school's calendar.
 */
export function SchoolLinkRequired() {
  const t = useTranslations("schedule.linkRequired");
  const tips = [
    { icon: MessageCircle, text: t("tipMessages") },
    { icon: School, text: t("tipAsk") },
    { icon: Link2, text: t("tipFullLink") },
  ];
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-3 text-center">
          <CalendarDays aria-hidden className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("body")}</p>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t("tipsTitle")}</h2>
          <ul className="space-y-2">
            {tips.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t pt-4 text-center text-sm text-muted-foreground">
          {t("staffPrompt")}{" "}
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("staffLogin")}
          </Link>
        </div>
      </div>
    </main>
  );
}
