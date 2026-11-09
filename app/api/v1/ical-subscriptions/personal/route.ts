import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { createPersonalCalendarSubscription, listSubscriptionsForStaff } from "@/lib/ical/subscriptions";
import { isDemoUser, withDemoLimits } from "@/lib/auth/demo-guard";

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.schoolId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.status !== "active" || user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Demo schools reuse a live feed so repeated clicks don't hit the 10-subscription cap.
  const live = isDemoUser(user)
    ? (await listSubscriptionsForStaff(user.schoolId, user.id)).find(
        // The demo admin's personal feed is unfiltered; never hand back a filtered one.
        (row) => row.revokedAt === null && row.filterGrades.length === 0 && row.filterEventTypes.length === 0,
      )
    : undefined;
  const result = live ?? (await createPersonalCalendarSubscription(user));
  const url = new URL(`/ical/${result.token}`, request.nextUrl.origin);

  return NextResponse.json(
    { id: result.id, url: url.toString() },
    { status: 201 },
  );
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const POST = withDemoLimits(handlePOST);
