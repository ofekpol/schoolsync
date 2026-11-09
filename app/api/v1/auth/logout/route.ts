import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearDemoCookie } from "@/lib/auth/demo-guard";

export async function POST(): Promise<NextResponse> {
  await clearDemoCookie();
  // Demo sessions have no Supabase session; skip when Supabase isn't configured (CI).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
