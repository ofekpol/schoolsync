import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/** Avoid a missing /_vercel endpoint on self-hosted or local production builds. */
export function VercelSpeedInsights() {
  if (process.env.VERCEL !== "1") return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
