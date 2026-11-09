import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { CalendarDays, Clock, Lock } from "lucide-react";
import { getStaffUser } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { DEMO_COOKIE } from "@/lib/auth/demo-session";
import { EDUSOLUTIONS_CONTACT_URL, EDUSOLUTIONS_SITE_URL } from "@/components/demo/site-links";

export const dynamic = "force-dynamic";

type Notice = "expired" | "busy" | "unavailable";

function noticeFrom(params: { expired?: string; error?: string }): Notice | null {
  if (params.error === "busy" || params.error === "unavailable") return params.error;
  return params.expired ? "expired" : null;
}

/**
 * Public entry to the demo sandbox. A GET never creates anything: the button
 * POSTs to /api/v1/demo, so link prefetchers and crawlers can't spawn schools.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; error?: string }>;
}) {
  const [params, t, cookieStore] = await Promise.all([searchParams, getTranslations("demo"), cookies()]);
  const notice = noticeFrom(params);
  // Only a demo cookie can mean "live demo"; never start a Supabase lookup from this public page.
  const hasLiveDemo = cookieStore.has(DEMO_COOKIE) && isDemoUser(await getStaffUser());
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border p-8 shadow-sm">
        <div className="space-y-3 text-center">
          <CalendarDays aria-hidden className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        {notice && (
          <p role="status" className="rounded-md border bg-muted p-3 text-center text-sm">
            {t(notice)}
            {notice === "busy" && (
              <>
                {" "}
                <a href={EDUSOLUTIONS_CONTACT_URL} className="font-medium text-primary underline-offset-4 hover:underline">
                  {t("contact")}
                </a>
              </>
            )}
          </p>
        )}
        <p className="flex items-start gap-3 text-sm text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t("introPrivate")}</span>
        </p>
        <div className="flex flex-col gap-3">
          {hasLiveDemo && (
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("continue")}
            </Link>
          )}
          <form method="post" action="/api/v1/demo">
            <button
              type="submit"
              className={
                hasLiveDemo
                  ? "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 font-medium hover:bg-muted"
                  : "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
              }
            >
              {hasLiveDemo && <Clock aria-hidden className="size-4" />}
              {hasLiveDemo ? t("startOver") : t("start")}
            </button>
          </form>
        </div>
        <div className="border-t pt-4 text-center text-sm">
          <a href={EDUSOLUTIONS_SITE_URL} className="text-muted-foreground underline-offset-4 hover:underline">
            {t("backToSite")}
          </a>
        </div>
      </div>
    </main>
  );
}
