import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStaffUserByAuthId, type StaffUserRecord } from "@/lib/db/staff";
import { getDemoStaffUser } from "@/lib/db/demo";
import { DEMO_COOKIE, demoSecret, verifyDemoSession } from "@/lib/auth/demo-session";

/**
 * Returns the authenticated Supabase auth user or null.
 * Uses getUser() (validates JWT against Supabase Auth server) — NEVER getSession()
 * which only reads the cookie locally (Pitfall 2 — research RESEARCH.md line 557).
 */
export async function getSession(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export type { StaffUserRecord };

/**
 * Resolves the authenticated user's staff_users row. Returns null if no auth or no matching row.
 * Delegates the DB lookup to `lib/db/staff.ts` so this file does not import the service-role
 * client directly (CLAUDE.md: the service-role client must only be imported inside `lib/db/`).
 */
async function resolveStaffUser(): Promise<StaffUserRecord | null> {
  // A demo cookie is checked first and never touches Supabase (demo schools have no Auth users).
  const demoToken = (await cookies()).get(DEMO_COOKIE)?.value;
  if (demoToken) {
    const check = await verifyDemoSession(demoToken, demoSecret());
    if (check.status !== "valid") return null;
    return getDemoStaffUser(check.session.staffId, check.session.schoolId);
  }
  const authUser = await getSession();
  if (!authUser) return null;
  // Bind by auth id only: an email match would let any account with that email inherit the row.
  return getStaffUserByAuthId(authUser.id);
}

/**
 * Shares the validated auth and staff lookup across a single server render.
 * React clears this cache between requests, so no staff data crosses sessions.
 */
export const getStaffUser = cache(resolveStaffUser);
