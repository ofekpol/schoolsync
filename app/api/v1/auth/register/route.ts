import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoDisabledResponse, hasDemoSession } from "@/lib/auth/demo-guard";
import { SchoolAccessTokenSchema } from "@/lib/validations/school";

const RegisterSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(8),
  inviteToken: z.string().uuid().optional(),
  // Secret school link token from `?school=`; a slug is rejected (422).
  school: SchoolAccessTokenSchema.optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Account creation and reset emails are outbound actions: off inside a demo session.
  if (await hasDemoSession()) return demoDisabledResponse();
  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { email, fullName, password, inviteToken, school } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        ...(inviteToken ? { invite_token: inviteToken } : {}),
        // Read back in /auth/confirm to file the pending registration under this school.
        ...(school ? { school } : {}),
      },
      emailRedirectTo: `${appUrl}/auth/confirm`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return NextResponse.json({ error: "email_already_registered" }, { status: 409 });
    }
    return NextResponse.json({ error: "signup_failed" }, { status: 500 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "signup_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "confirmation_sent" }, { status: 200 });
}
