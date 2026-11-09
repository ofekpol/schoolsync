import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/auth/demo-session";

/** True for the staff user of a public demo school (lib/db/demo.ts). */
export function isDemoUser(user: { demoExpiresAt?: Date | null } | null | undefined): boolean {
  return user?.demoExpiresAt != null;
}

/** Outbound and account actions (mail, GitHub, AI, staff accounts) are off in demos. */
export function demoDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "demo_disabled" }, { status: 403 });
}

/** Messages raised by the demo_enforce_limits trigger (migration 0019). */
const LIMIT_RESPONSES: Record<string, { error: string; status: number }> = {
  demo_quota: { error: "demo_quota", status: 403 },
  demo_text_too_long: { error: "demo_text_too_long", status: 400 },
};

/** Maps a demo-limit database error (possibly wrapped by Drizzle in `cause`) to a response. */
export function demoLimitResponse(error: unknown): NextResponse | null {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++) {
    const message = current instanceof Error ? current.message : "";
    const match = LIMIT_RESPONSES[message];
    if (match) return NextResponse.json({ error: match.error }, { status: match.status });
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}

/** Wraps a route handler so demo-limit trigger errors become 403/400 instead of 500. */
export function withDemoLimits<Args extends unknown[], R extends Response>(
  handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R | NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const response = demoLimitResponse(error);
      if (response) return response;
      throw error;
    }
  };
}

/** Real sign-in and logout drop any demo session so it cannot shadow a Supabase one. */
export async function clearDemoCookie(): Promise<void> {
  (await cookies()).delete(DEMO_COOKIE);
}
