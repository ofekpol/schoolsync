import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Clock, Link2, MailPlus, UserCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { getStaffUser } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { listStaffUsers } from "@/lib/db/staff";
import { getSchoolById } from "@/lib/db/schools";
import { listInvitesForSchool } from "@/lib/db/invites";
import { listPendingRegistrations } from "@/lib/db/pending";
import { listEventTypes } from "@/lib/admin/event-types";
import { StaffTable } from "@/components/admin/StaffTable";
import { PendingRequestsTable } from "@/components/admin/PendingRequestsTable";
import { InviteForm } from "@/components/admin/InviteForm";
import { AddStaffForm } from "@/components/admin/AddStaffForm";
import { InviteTable } from "@/components/admin/InviteTable";
import { SchoolLinks } from "@/components/admin/SchoolLinks";

/**
 * Admin staff management page — Server Component.
 * Lists all staff in the school with create/edit/deactivate controls.
 * ADMIN-01 entry point.
 */
export default async function AdminStaffPage() {
  const user = await getStaffUser();
  if (!user?.schoolId) redirect("/auth/login");
  if (user.role !== "admin") redirect("/dashboard");

  const [staff, eventTypes, pendingRegs, invites, school, requestHeaders] = await Promise.all([
    listStaffUsers(user.schoolId),
    listEventTypes(user.schoolId),
    listPendingRegistrations(user.schoolId),
    listInvitesForSchool(user.schoolId),
    getSchoolById(user.schoolId),
    headers(),
  ]);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  const t = await getTranslations("admin.staff");
  const tDemo = await getTranslations("demo");
  const demo = isDemoUser(user);
  const activeCount = staff.filter((member) => !member.deactivatedAt).length;
  const editorCount = staff.filter(
    (member) => member.role === "editor" && !member.deactivatedAt,
  ).length;
  const openInviteCount = invites.filter(
    (invite) => !invite.usedAt && !invite.revokedAt,
  ).length;

  return (
    <main className="space-y-6 bg-[var(--sg-page)] p-4 text-neutral-950 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StaffStat
          icon={<Users className="size-4" />}
          label={t("totalStaff")}
          value={staff.length}
        />
        <StaffStat
          icon={<UserCheck className="size-4" />}
          label={t("activeStaff")}
          value={activeCount}
        />
        <StaffStat icon={<Users className="size-4" />} label={t("editors")} value={editorCount} />
        <StaffStat
          icon={<Clock className="size-4" />}
          label={t("pendingRequests")}
          value={pendingRegs.length}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader title={t("activeStaff")} count={staff.length} />
        <StaffTable initialStaff={staff} eventTypes={eventTypes} />
      </section>

      {demo ? (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {tDemo("staffDisabled")}
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <SectionHeader title={t("pendingRequests")} count={pendingRegs.length} />
            <PendingRequestsTable pending={pendingRegs} eventTypes={eventTypes} />
          </section>

          <section className="sg-staff-card space-y-3 rounded-xl border bg-white p-4">
            <h2 className="text-lg font-semibold">{t("create")}</h2>
            <AddStaffForm eventTypes={eventTypes} />
          </section>
        </>
      )}

      {school && (
        <section className="sg-staff-card space-y-3 rounded-xl border bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Link2 className="size-4" />
            {t("schoolLinks.title")}
          </h2>
          <SchoolLinks accessToken={school.accessToken} origin={origin} guestOnly={demo} />
        </section>
      )}

      {!demo && (
        <section className="sg-staff-card space-y-4 rounded-xl border bg-white p-4">
          <SectionHeader
            title={t("invites")}
            count={openInviteCount}
            icon={<MailPlus className="size-4" />}
          />
          <div className="space-y-4">
            <InviteForm eventTypes={eventTypes} />
            <InviteTable invites={invites} />
          </div>
        </section>
      )}
    </main>
  );
}

function StaffStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="sg-card sg-interactive rounded-xl p-4">
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <span className="text-neutral-500">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-neutral-950 tabular-nums">{value}</div>
    </div>
  );
}

function SectionHeader({ title, count, icon }: { title: string; count: number; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
        {count}
      </span>
    </div>
  );
}
