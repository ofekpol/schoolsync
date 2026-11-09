import { type NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearDemoCookie } from "@/lib/auth/demo-guard";
import { createStaffUserFromInvite, getStaffUserByAuthId } from "@/lib/db/staff";
import { getInviteByToken, markInviteUsed, updateInviteUsedBy } from "@/lib/db/invites";
import {
  assignPendingSchoolIfMissing,
  createPendingRegistration,
  getPendingRegistrationByAuthId,
} from "@/lib/db/pending";
import { resolveSchoolIdFromParam } from "@/lib/db/schools";

export async function GET(request: NextRequest) {
  await clearDemoCookie();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite_token");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  // Supabase rejects a banned Google sign-in before issuing a code.
  if (searchParams.get("error_code") === "user_banned") {
    return NextResponse.redirect(new URL("/auth/deactivated", origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  const authUser = data.user;
  const staffUser = await getStaffUserByAuthId(authUser.id);

  if (staffUser) {
    if (staffUser.status === "active") {
      return NextResponse.redirect(new URL(next, origin));
    }
    if (staffUser.status === "deactivated") {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/auth/deactivated", origin));
    }
    // status === "pending"
    return NextResponse.redirect(new URL("/auth/pending", origin));
  }

  const metadata = authUser.user_metadata ?? {};
  const email = authUser.email ?? "";
  const fullName =
    String(metadata.full_name ?? metadata.name ?? email).trim() || email;
  const googleAvatarUrl =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

  if (inviteToken) {
    const invite = await getInviteByToken(inviteToken);
    const isValid =
      invite &&
      !invite.revokedAt &&
      (invite.multiUse || !invite.usedAt);

    if (!isValid) {
      return NextResponse.redirect(new URL(`/invite/${inviteToken}?error=expired`, origin));
    }

    // For single-use invites, atomically claim the slot before creating the staff user
    // to prevent duplicate redemptions from concurrent requests.
    if (!invite.multiUse) {
      const { affected } = await markInviteUsed(inviteToken, null, false);
      if (affected === 0) {
        return NextResponse.redirect(new URL(`/invite/${inviteToken}?error=expired`, origin));
      }
    }

    const created = await createStaffUserFromInvite({
      authUserId: authUser.id,
      schoolId: invite.schoolId,
      email,
      fullName,
      role: invite.role,
      gradeScopes: invite.gradeScopes,
      eventTypeScopes: invite.eventTypeScopes,
    });

    if (!invite.multiUse) {
      await updateInviteUsedBy(inviteToken, created.id);
    }

    return NextResponse.redirect(new URL(next, origin));
  }

  const pending = await getPendingRegistrationByAuthId(authUser.id);
  const schoolId = await resolveSchoolIdFromParam(searchParams.get("school"));
  if (!pending) {
    await createPendingRegistration({ authUserId: authUser.id, email, fullName, googleAvatarUrl, schoolId });
  } else if (pending.schoolId === null && schoolId) {
    await assignPendingSchoolIfMissing(authUser.id, schoolId);
  }

  return NextResponse.redirect(new URL("/auth/pending", origin));
}
