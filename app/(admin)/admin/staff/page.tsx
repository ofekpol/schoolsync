import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { listStaffUsers } from "@/lib/db/staff";
import { getSchoolById } from "@/lib/db/schools";
import { listInvitesForSchool } from "@/lib/db/invites";
import { listPendingRegistrations } from "@/lib/db/pending";
import { listEventTypes } from "@/lib/admin/event-types";
import { StaffTable } from "@/components/admin/StaffTable";
import { PendingRequestsTable } from "@/components/admin/PendingRequestsTable";
import { AddStaffDialog } from "@/components/admin/AddStaffDialog";
import { InviteTable } from "@/components/admin/InviteTable";
import { SchoolLinks } from "@/components/admin/SchoolLinks";
import { StaffTabs, type StaffTab } from "@/components/admin/StaffTabs";

/**
 * Admin staff management page — Server Component.
 * Tabs: staff list / pending sign-ups / invite links / school links, with one
 * "Add staff" dialog (create account or invite link). ADMIN-01 entry point.
 */
export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getStaffUser();
  if (!user?.schoolId) redirect("/auth/login");
  if (user.role !== "admin") redirect("/dashboard");

  const [staff, eventTypes, pendingRegs, invites, school, requestHeaders, params] =
    await Promise.all([
      listStaffUsers(user.schoolId),
      listEventTypes(user.schoolId),
      listPendingRegistrations(user.schoolId),
      listInvitesForSchool(user.schoolId),
      getSchoolById(user.schoolId),
      headers(),
      searchParams,
    ]);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  const t = await getTranslations("admin.staff");
  const tDemo = await getTranslations("demo");
  const demo = isDemoUser(user);
  const activeCount = staff.filter((member) => !member.deactivatedAt).length;
  const openInviteCount = invites.filter((invite) => !invite.usedAt && !invite.revokedAt).length;

  const staffPanel = (
    <div className="space-y-4">
      {demo && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {tDemo("staffDisabled")}
        </p>
      )}
      <StaffTable initialStaff={staff} eventTypes={eventTypes} readOnly={demo} />
    </div>
  );

  const tabs: StaffTab[] = [{ id: "staff", label: t("tabs.staff"), count: activeCount, panel: staffPanel }];
  if (!demo) {
    tabs.push(
      {
        id: "requests",
        label: t("tabs.requests"),
        count: pendingRegs.length,
        attention: pendingRegs.length > 0,
        panel: <PendingRequestsTable pending={pendingRegs} eventTypes={eventTypes} />,
      },
      {
        id: "invites",
        label: t("tabs.invites"),
        count: openInviteCount,
        panel: (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm text-neutral-600">{t("invitesHint")}</p>
              <AddStaffDialog
                eventTypes={eventTypes}
                initialMode="invite"
                triggerLabel={t("newInvite")}
                triggerVariant="outline"
              />
            </div>
            <InviteTable invites={invites} eventTypes={eventTypes} />
          </div>
        ),
      },
    );
  }
  if (school) {
    tabs.push({
      id: "links",
      label: t("schoolLinks.title"),
      panel: <SchoolLinks accessToken={school.accessToken} origin={origin} guestOnly={demo} />,
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 text-neutral-950 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
        </div>
        {!demo && <AddStaffDialog eventTypes={eventTypes} triggerLabel={t("addStaff")} />}
      </div>
      <StaffTabs tabs={tabs} initialTab={params.tab} pendingCount={pendingRegs.length} />
    </main>
  );
}
