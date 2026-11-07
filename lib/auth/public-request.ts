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
  "/api/v1/export/",
  "/api/v1/ical-subscriptions/personal",
];

const RESERVED_PREFIXES = [
  "/auth", "/invite", "/ical", "/api", "/admin",
  "/dashboard", "/events", "/profile", "/_next", "/schedule", "/platform", "/support",
];

export function shouldBypassAuthRefresh(pathname: string): boolean {
  // "/" must stay gated: HomePage's own auth check runs after the shell has
  // already started streaming, so a redirect() there degrades to a client-side
  // <meta refresh> with a hardcoded ~1s delay instead of a real HTTP redirect.
  // Letting middleware redirect unauthenticated requests here keeps it instant.

  // Exact match for read-only public schedule
  if (pathname === "/schedule" || pathname === "/schedule/") return true;

  // Prefix match for auth and API public routes
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  return (
    !RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
    /^\/[^/]+(\/calendar|\/agenda)?$/.test(pathname)
  );
}
