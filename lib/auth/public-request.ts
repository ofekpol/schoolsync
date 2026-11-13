const PUBLIC_PREFIXES = [
  "/accessibility",
  "/privacy",
  "/auth/login",
  "/auth/callback",
  "/auth/confirm",
  "/auth/register",
  "/auth/pending",
  "/auth/deactivated",
  "/auth/change-password",
  "/auth/forgot-password",
  "/invite/",
  "/ical/",
  "/api/v1/auth/signin",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/forgot-password",
  "/api/v1/public/",
  "/api/health",
  "/api/v1/export/",
  "/api/v1/ical-subscriptions/personal",
];

const DEMO_PUBLIC_PATHS = new Set(["/demo", "/api/v1/demo", "/api/cron/demo-cleanup"]);

const RESERVED_PREFIXES = [
  "/auth", "/invite", "/ical", "/api", "/admin",
  "/dashboard", "/events", "/profile", "/_next", "/schedule", "/platform", "/support", "/demo",
  "/timetable",
];

export function shouldBypassAuthRefresh(pathname: string): boolean {
  // "/" must stay gated: HomePage's own auth check runs after the shell has
  // already started streaming, so a redirect() there degrades to a client-side
  // <meta refresh> with a hardcoded ~1s delay instead of a real HTTP redirect.
  // Letting middleware redirect unauthenticated requests here keeps it instant.

  // Exact match for read-only public schedule
  if (pathname === "/schedule" || pathname === "/schedule/") return true;

  // Public demo entry + creation (reachable with no cookie or an expired one) and its cleanup cron.
  if (DEMO_PUBLIC_PATHS.has(pathname)) return true;

  // Prefix match for auth and API public routes
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  return (
    !RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
    /^\/[^/]+(\/calendar|\/agenda)?$/.test(pathname)
  );
}
