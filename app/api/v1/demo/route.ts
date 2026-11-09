import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_COOKIE,
  demoCookieOptions,
  demoHmacHex,
  demoSecret,
  signDemoSession,
  verifyDemoSession,
} from "@/lib/auth/demo-session";
import {
  DEMO_CLEANUP_BATCH,
  cleanupExpiredDemos,
  createDemoSchool,
  deleteDemoSchool,
  reserveDemoSlot,
} from "@/lib/db/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Form POST from /demo; every outcome is a 303 so the browser lands on a page. */
function seeOther(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function clientIp(request: NextRequest): string {
  // On Vercel the first x-forwarded-for entry is the client address set by the edge.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** "Start over": drop the visitor's previous demo now instead of waiting for expiry. */
async function deletePreviousDemo(request: NextRequest, secret: string): Promise<void> {
  const check = await verifyDemoSession(request.cookies.get(DEMO_COOKIE)?.value, secret);
  if (check.status !== "invalid") await deleteDemoSchool(check.session.schoolId);
}

async function signOutSupabase(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = demoSecret();
  if (!secret) return seeOther(request, "/demo?error=unavailable");
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reservation = await reserveDemoSlot(await demoHmacHex(secret, `ip:${clientIp(request)}`));
  if (reservation !== "ok") return seeOther(request, "/demo?error=busy");

  try {
    await cleanupExpiredDemos(DEMO_CLEANUP_BATCH);
    await deletePreviousDemo(request, secret);
    const demo = await createDemoSchool();
    await signOutSupabase();
    const exp = demo.expiresAt.getTime();
    const token = await signDemoSession({ staffId: demo.staffId, schoolId: demo.schoolId, exp }, secret);
    const response = seeOther(request, "/dashboard");
    response.cookies.set(DEMO_COOKIE, token, demoCookieOptions(exp));
    return response;
  } catch (error) {
    console.error("[demo] creation failed", error instanceof Error ? error.message : error);
    return seeOther(request, "/demo?error=unavailable");
  }
}
