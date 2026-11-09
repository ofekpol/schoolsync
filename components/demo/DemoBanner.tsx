import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FlaskConical } from "lucide-react";
import { jerusalemDateString, jerusalemTimeString } from "@/lib/datetime";
import { EDUSOLUTIONS_SITE_URL } from "@/components/demo/site-links";

/** "HH:MM, DD.MM" on the Jerusalem clock. */
function formatExpiry(expiresAt: Date): string {
  const [, month, day] = jerusalemDateString(expiresAt).split("-");
  return `${jerusalemTimeString(expiresAt)}, ${day}.${month}`;
}

/** Persistent strip on every staff page of a demo school. */
export async function DemoBanner({ expiresAt }: { expiresAt: Date }) {
  const t = await getTranslations("demo");
  return (
    <div
      role="note"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden"
    >
      <span className="inline-flex items-center gap-2">
        <FlaskConical aria-hidden className="size-4 shrink-0" />
        {t("banner", { time: formatExpiry(expiresAt) })}
      </span>
      <Link href="/demo" className="font-medium underline underline-offset-4">
        {t("startOver")}
      </Link>
      <a href={EDUSOLUTIONS_SITE_URL} className="font-medium underline underline-offset-4">
        {t("backToSite")}
      </a>
    </div>
  );
}
