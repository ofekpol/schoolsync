import { getTranslations } from "next-intl/server";
import { isSupportEnabled } from "@/lib/support/github";
import { SupportForm } from "@/components/support/SupportForm";

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

/** Staff help / bug-report form. The (staff) layout already requires an active staff user. */
export default async function SupportPage({ searchParams }: PageProps) {
  const { from } = await searchParams;
  const t = await getTranslations("support");
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {isSupportEnabled() ? (
        <SupportForm page={from?.startsWith("/") ? from.slice(0, 500) : undefined} />
      ) : (
        <p role="status">{t("disabled")}</p>
      )}
    </main>
  );
}
