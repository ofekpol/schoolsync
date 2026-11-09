import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearDemoCookie } from "@/lib/auth/demo-guard";
import {
  createStaffUserFromInvite,
  getStaffUserByAuthId,
  getStaffUserByEmail,
  incrementLoginAttempts,
  resetLoginAttempts,
} from "@/lib/db/staff";
import { getInviteByToken, markInviteUsed, updateInviteUsedBy } from "@/lib/db/invites";
import { getPostLoginRedirect } from "@/lib/auth/redirects";
import { assignPendingSchoolIfMissing } from "@/lib/db/pending";
import { resolveSchoolIdFromParam } from "@/lib/db/schools";

const MAX_ATTEMPTS = 10;

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Secret school link token from the login page; validated by resolveSchoolIdFromParam. */
  school: z.string().max(64).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  await clearDemoCookie();
  const body = await request.json().catch(() => null);
  const parsed = SignInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { email, password, school } = parsed.data;

  const staffUser = await getStaffUserByEmail(email);

  if (staffUser?.lockedUntil && new Date(staffUser.lockedUntil) > new Date()) {
    return NextResponse.json(
      {
        error: "account_locked",
        lockedUntil:
          staffUser.lockedUntil instanceof Date
            ? staffUser.lockedUntil.toISOString()
            : staffUser.lockedUntil,
      },
      { status: 423 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Supabase checks the ban before the password, so this is not a failed attempt.
  if (error?.code === "user_banned") {
    return NextResponse.json(
      { status: "deactivated", redirectTo: "/auth/deactivated" },
      { status: 200 },
    );
  }

  if (error || !data.user) {
    if (staffUser) {
      await incrementLoginAttempts(staffUser.id, staffUser.loginAttempts);
      const newAttempts = staffUser.loginAttempts + 1;
      const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
      return NextResponse.json(
        { error: "invalid_credentials", attemptsRemaining: remaining },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const authedStaffUser = await getStaffUserByAuthId(data.user.id);

  if (authedStaffUser) {
    await resetLoginAttempts(authedStaffUser.id);
  } else if (staffUser) {
    await resetLoginAttempts(staffUser.id);
  }

  // No email fallback: a staff row is bound to its auth id only.
  let resolvedUser = authedStaffUser;

  // If still no staff record, check for a pending invite in user_metadata.
  // This handles the case where /auth/confirm was hit by an email scanner
  // (consuming the OTP) before the user clicked the link, leaving them with a
  // confirmed auth account but no staff_users row.
  if (!resolvedUser) {
    const inviteToken = data.user.user_metadata?.invite_token as string | undefined;
    if (inviteToken) {
      try {
        const invite = await getInviteByToken(inviteToken);
        const isValid =
          invite &&
          !invite.revokedAt &&
          (invite.multiUse || !invite.usedAt);
        // Claim single-use invites atomically, exactly like /auth/confirm, so the
        // same token cannot mint more than one account through this fallback.
        if (invite && isValid && (await markInviteUsed(inviteToken, null, invite.multiUse)).affected > 0) {
          const created = await createStaffUserFromInvite({
            authUserId: data.user.id,
            schoolId: invite.schoolId,
            email: data.user.email ?? email,
            fullName: String(data.user.user_metadata?.full_name ?? email),
            role: invite.role,
            gradeScopes: invite.gradeScopes,
            eventTypeScopes: invite.eventTypeScopes,
          });
          if (!invite.multiUse) await updateInviteUsedBy(inviteToken, created.id);
          resolvedUser = await getStaffUserByAuthId(data.user.id);
        }
      } catch {
        // Non-fatal: user lands on /auth/pending and an admin can assign them manually.
      }
    }
  }

  // Email registrant who signed up without a school link, now arriving through one.
  if (!resolvedUser) {
    const schoolId = await resolveSchoolIdFromParam(school);
    if (schoolId) await assignPendingSchoolIfMissing(data.user.id, schoolId);
  }

  return NextResponse.json(
    {
      status: "ok",
      // No staff row yet = a confirmed registrant waiting for admin approval.
      redirectTo: resolvedUser ? getPostLoginRedirect(resolvedUser) : "/auth/pending",
    },
    { status: 200 },
  );
}
