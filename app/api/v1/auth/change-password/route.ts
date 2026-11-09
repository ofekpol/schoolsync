import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession, getStaffUser } from "@/lib/auth/session";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";
import { db } from "@/lib/db/client";
import { staffUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ChangePasswordSchema = z.object({
  password: z
    .string()
    .min(8, "סיסמה חייבת להכיל לפחות 8 תווים")
    .regex(/[A-Z]/, "סיסמה חייבת להכיל לפחות אות גדולה אחת")
    .regex(/[0-9]/, "סיסמה חייבת להכיל לפחות ספרה אחת"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isDemoUser(await getStaffUser())) return demoDisabledResponse();
  const authUser = await getSession();
  if (!authUser) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await db
    .update(staffUsers)
    .set({ mustChangePassword: false })
    .where(eq(staffUsers.id, authUser.id));

  return NextResponse.json({ ok: true });
}
