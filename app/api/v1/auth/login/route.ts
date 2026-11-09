import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearDemoCookie } from "@/lib/auth/demo-guard";

/**
 * Test-only email/password login endpoint.
 * Only active when TEST_LOGIN_ENABLED=1 — returns 404 in all other environments.
 * Used by Playwright global setup (test/e2e/global.setup.ts) to create auth
 * state files without going through the Google OAuth flow.
 */

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  await clearDemoCookie();
  if (process.env.TEST_LOGIN_ENABLED !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "email and password required" },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
