import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Site-wide links required by Israeli accessibility and privacy rules. */
export async function LegalFooter() {
  const t = await getTranslations("legal.footer");
  return (
    <footer className="print:hidden border-t px-4 py-3 text-center text-xs text-muted-foreground">
      <nav aria-label={t("label")} className="flex justify-center gap-4">
        <Link href="/accessibility" className="hover:underline">
          {t("accessibility")}
        </Link>
        <Link href="/privacy" className="hover:underline">
          {t("privacy")}
        </Link>
      </nav>
    </footer>
  );
}
