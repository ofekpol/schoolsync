import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./print.css";
import { Geist, Frank_Ruhl_Libre, Heebo, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { dirFor, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { RouteProgressProvider } from "@/components/RouteProgress";
import { VercelSpeedInsights } from "@/components/VercelSpeedInsights";
import { LegalFooter } from "@/components/legal/LegalFooter";

// Only Heebo (UI) is preloaded — it's the body font for every Hebrew
// page above the fold. Display / mono / sans-latin fonts load on demand
// with display: swap to avoid CLS, eliminating ~8 unused-preload warnings.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  preload: false,
});

const frankRuhlLibre = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-ui",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "School Gantt",
  description: "Multi-tenant school event calendar",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const messages = await getMessages();
  const t = await getTranslations("a11y");

  return (
    <html
      dir={dirFor(locale)}
      lang={locale}
      className={cn(
        "font-sans",
        geist.variable,
        frankRuhlLibre.variable,
        heebo.variable,
        ibmPlexMono.variable,
      )}
    >
      <body className="min-h-screen bg-[var(--sg-page)] text-neutral-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-neutral-900 focus:px-3 focus:py-2 focus:text-white"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <RouteProgressProvider>
            <div id="main">{children}</div>
            <LegalFooter />
          </RouteProgressProvider>
        </NextIntlClientProvider>
        <VercelSpeedInsights />
      </body>
    </html>
  );
}
