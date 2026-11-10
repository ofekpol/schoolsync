import { getTranslations } from "next-intl/server";
import { LifeBuoy } from "lucide-react";
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
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--sg-studio-blue-soft)] text-[var(--sg-studio-blue)]">
          <LifeBuoy aria-hidden className="size-7" />
        </span>
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{t("title")}</h1>
        <p className="max-w-md text-neutral-600">{t("intro")}</p>
      </header>
      <section className="sg-card rounded-2xl p-5 sm:p-7">
        {isSupportEnabled() ? (
          <SupportForm page={from?.startsWith("/") ? from.slice(0, 500) : undefined} />
        ) : (
          <p role="status" className="text-center text-neutral-600">{t("disabled")}</p>
        )}
      </section>
    </main>
  );
}
