import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { getSchoolById } from "@/lib/db/schools";
import { isPlatformAdmin } from "@/lib/db/platform-admins";
import { AppHeader } from "@/components/AppHeader";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SupportLink } from "@/components/support/SupportLink";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { isDemoUser, signedOutPath } from "@/lib/auth/demo-guard";
import { buildNavLinks, getCurrentPath } from "@/lib/nav";
import type { ReactNode } from "react";

/**
 * Admin route group layout.
 * AUTH guard: redirects unauthenticated users to /auth/login.
 * STATUS guard: pending users → /auth/pending; deactivated → /auth/deactivated.
 * ROLE guard: redirects viewers to /dashboard. Per-page guards enforce
 * admin-only access for staff/year; event-types also allows editors.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getStaffUser();
  if (!user) redirect(await signedOutPath());
  if (user.status === "pending") redirect("/auth/pending");
  if (user.status === "deactivated") redirect("/auth/deactivated");
  if (user.mustChangePassword) redirect("/auth/change-password");
  if (user.role === "viewer") redirect("/dashboard");
  const [navLinks, currentPath, t, school] = await Promise.all([
    isPlatformAdmin(user.id).then((platform) => buildNavLinks(user.role, platform)),
    getCurrentPath(),
    getTranslations("nav"),
    user.schoolId ? getSchoolById(user.schoolId) : null,
  ]);
  return (
    <div className="min-h-screen">
      {user.demoExpiresAt && <DemoBanner expiresAt={user.demoExpiresAt} />}
      <AppHeader
        title={school?.name ?? user.fullName}
        subtitle={isDemoUser(user) ? undefined : user.email}
        navLinks={navLinks}
        currentPath={currentPath}
        rightSlot={
          <>
            {!isDemoUser(user) && <SupportLink currentPath={currentPath} />}
            <span className="max-w-48 truncate text-sm font-medium text-neutral-900">
              {user.fullName}
            </span>
            <LogoutButton label={t("logout")} />
          </>
        }
      />
      {children}
    </div>
  );
}
