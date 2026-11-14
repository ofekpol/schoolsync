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
import { listCategories } from "@/lib/profile/categories";
import { listStaffLabels } from "@/lib/profile/staff-labels";
import { StaffTable } from "@/components/admin/StaffTable";
import { PendingRequestsTable } from "@/components/admin/PendingRequestsTable";
import { AddStaffDialog } from "@/components/admin/AddStaffDialog";
import { InviteTable } from "@/components/admin/InviteTable";
import { SchoolLinks } from "@/components/admin/SchoolLinks";
import { StaffTabs, type StaffTab } from "@/components/admin/StaffTabs";
import { CategoryManager } from "@/components/profile/CategoryManager";

/**
 * Admin staff management page — Server Component.
 * Tabs: staff list / pending sign-ups / invite links / profile categories /
 * school links, with one
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

  const [staff, eventTypes, pendingRegs, invites, school, requestHeaders, params, categories, labels] =
    await Promise.all([
      listStaffUsers(user.schoolId),
      listEventTypes(user.schoolId),
      listPendingRegistrations(user.schoolId),
      listInvitesForSchool(user.schoolId),
      getSchoolById(user.schoolId),
      headers(),
      searchParams,
      listCategories(user.schoolId),
      listStaffLabels(user.schoolId),
    ]);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  const t = await getTranslations("admin.staff");
  const tDemo = await getTranslations("demo");
  const tCategories = await getTranslations("admin.categories");
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
      <StaffTable initialStaff={staff} eventTypes={eventTypes} readOnly={demo}
        categories={categories} labels={labels} />
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
  tabs.push({
    id: "categories",
    label: t("tabs.categories"),
    count: categories.length,
    panel: (
      <div className="space-y-4">
        <p className="max-w-xl text-sm text-neutral-600">{tCategories("description")}</p>
        {demo && (
          <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            {tCategories("demoNote")}
          </p>
        )}
        <div className="max-w-2xl">
          <CategoryManager initial={categories} readOnly={demo} />
        </div>
      </div>
    ),
  });
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
