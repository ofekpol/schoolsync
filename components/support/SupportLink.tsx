import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LifeBuoy } from "lucide-react";
import { isSupportEnabled } from "@/lib/support/github";

/** Header link to the help / bug-report form; hidden until support reports are configured. */
export async function SupportLink({ currentPath }: { currentPath: string }) {
  if (!isSupportEnabled()) return null;
  const t = await getTranslations("support");
  return (
    <Link
      href={{ pathname: "/support", query: currentPath ? { from: currentPath } : {} }}
      className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
    >
      <LifeBuoy aria-hidden className="size-4" />
      <span className="sr-only sm:not-sr-only">{t("link")}</span>
    </Link>
  );
}
