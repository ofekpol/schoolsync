import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./print.css";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { dirFor, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { RouteProgressProvider } from "@/components/RouteProgress";
import { VercelSpeedInsights } from "@/components/VercelSpeedInsights";
import { Analytics } from "@vercel/analytics/next";
import { LegalFooter } from "@/components/legal/LegalFooter";

// Fonts are committed under app/fonts (OFL, see OFL-*.txt) so builds never
// depend on Google's font servers. Variable files are subset to latin (+hebrew)
// with the same unicode ranges Google serves.
// Only Heebo (UI) is preloaded — it's the body font for every Hebrew
// page above the fold. Display / mono / sans-latin fonts load on demand
// with display: swap to avoid CLS, eliminating ~8 unused-preload warnings.
const geist = localFont({
  src: "./fonts/Geist-latin-var.woff2",
  weight: "100 900",
  variable: "--font-sans",
  preload: false,
});

const frankRuhlLibre = localFont({
  src: "./fonts/FrankRuhlLibre-hebrew-latin-var.woff2",
  weight: "300 900",
  variable: "--font-display",
  adjustFontFallback: "Times New Roman", // serif fallback, as next/font/google used
  display: "swap",
  preload: false,
});

const heebo = localFont({
  src: "./fonts/Heebo-hebrew-latin-var.woff2",
  weight: "100 900",
  variable: "--font-ui",
  display: "swap",
});

const ibmPlexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.woff2", weight: "400" },
    { path: "./fonts/IBMPlexMono-Medium.woff2", weight: "500" },
    { path: "./fonts/IBMPlexMono-SemiBold.woff2", weight: "600" },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "SchoolSync",
  description: "SchoolSync: the school's event calendar",
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
        <Analytics />
      </body>
    </html>
  );
}
