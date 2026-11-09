import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoDisabledResponse, hasDemoSession } from "@/lib/auth/demo-guard";

const ForgotPasswordSchema = z.object({ email: z.string().email() });

/**
 * Sends Supabase's password-recovery email. Always answers 200 for a valid
 * email so the response never reveals whether an account exists.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Account creation and reset emails are outbound actions: off inside a demo session.
  if (await hasDemoSession()) return demoDisabledResponse();
  const body = await request.json().catch(() => null);
  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // The callback exchanges the recovery code for a session, then the user picks a new password.
    redirectTo: `${appUrl}/auth/callback?next=/auth/change-password`,
  });
  if (error) console.error("forgot-password: resetPasswordForEmail failed", error.message);

  return NextResponse.json({ status: "sent" }, { status: 200 });
}
