import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { getSchoolById } from "@/lib/db/schools";
import { isPlatformAdmin } from "@/lib/db/platform-admins";
import { AppHeader } from "@/components/AppHeader";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SupportLink } from "@/components/support/SupportLink";
import { StaffEntryLoading } from "@/components/staff/StaffEntryLoading";
import { buildNavLinks, getCurrentPath } from "@/lib/nav";
import { StaffChatPanel } from "@/components/ai/StaffChatPanel";
import { isAiEnabled } from "@/lib/ai/model";
import { Suspense, type ReactNode } from "react";

/**
 * Staff route group layout.
 * AUTH guard: redirects unauthenticated users to /auth/login.
 * STATUS guard: pending users → /auth/pending; deactivated → /auth/deactivated.
 * All routes under (staff)/ are protected by this layout.
 */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<StaffEntryLoading />}>
      <StaffLayoutContent>{children}</StaffLayoutContent>
    </Suspense>
  );
}

async function StaffLayoutContent({ children }: { children: ReactNode }) {
  const user = await getStaffUser();
  if (!user) redirect("/auth/login");
  if (user.status === "pending") redirect("/auth/pending");
  if (user.status === "deactivated") redirect("/auth/deactivated");
  if (user.mustChangePassword) redirect("/auth/change-password");
  const [navLinks, currentPath, t, school] = await Promise.all([
    isPlatformAdmin(user.id).then((platform) => buildNavLinks(user.role, platform)),
    getCurrentPath(),
    getTranslations("nav"),
    user.schoolId ? getSchoolById(user.schoolId) : null,
  ]);
  return (
    <>
      <AppHeader
        title={school?.name ?? user.fullName}
        subtitle={user.email}
        navLinks={navLinks}
        currentPath={currentPath}
        rightSlot={
          <>
            <SupportLink currentPath={currentPath} />
            <span className="max-w-48 truncate text-sm font-medium text-neutral-900">
              {user.fullName}
            </span>
            <LogoutButton label={t("logout")} />
          </>
        }
      />
      {children}
      {isAiEnabled() && <StaffChatPanel />}
    </>
  );
}
