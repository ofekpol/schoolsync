import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { shouldBypassAuthRefresh } from "@/lib/auth/public-request";
import { DEMO_COOKIE, demoSecret, verifyDemoSession } from "@/lib/auth/demo-session";

/**
 * Auth gate + Supabase session refresh.
 * All routes require authentication except the PUBLIC_PATHS allowlist.
 * Locale is handled by i18n/request.ts via the NEXT_LOCALE cookie —
 * no path-prefix routing, so all routes stay clean regardless of locale.
 */
export async function middleware(request: NextRequest) {
  // Expose pathname to server components so layouts can highlight the
  // active nav link without becoming client components.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const { pathname } = request.nextUrl;
  // Opening the login page leaves the demo; otherwise it bounces straight back into it.
  if (pathname === "/auth/login" && request.cookies.has(DEMO_COOKIE)) {
    request.cookies.delete(DEMO_COOKIE);
    response = NextResponse.next({ request: { headers: request.headers } });
    response.cookies.delete(DEMO_COOKIE);
    return response;
  }
  if (shouldBypassAuthRefresh(pathname)) return response;

  // Demo sessions are checked before (and instead of) Supabase.
  const demoToken = request.cookies.get(DEMO_COOKIE)?.value;
  if (demoToken) return handleDemoRequest(request, response, demoToken);

  // Skip Supabase setup in test envs without the keys.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: {
          name: string;
          value: string;
          options?: CookieOptions;
        }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() validates JWT and refreshes the session if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

const PLATFORM_PREFIXES = ["/platform", "/api/v1/platform"];

/**
 * A valid demo cookie authenticates staff/admin routes (never platform ones).
 * An invalid or expired one is cleared: pages go to the "demo ended" screen, APIs get 401.
 */
async function handleDemoRequest(
  request: NextRequest,
  response: NextResponse,
  token: string,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const check = await verifyDemoSession(token, demoSecret());
  if (check.status === "valid") {
    if (!PLATFORM_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return response;
    }
    return isApi
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(new URL("/dashboard", request.url));
  }
  const ended = isApi
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : NextResponse.redirect(new URL("/demo?expired=1", request.url));
  ended.cookies.delete(DEMO_COOKIE);
  return ended;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
