import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { StaffUserRecord } from "@/lib/auth/session";
import { getSchoolById } from "@/lib/db/schools";
import { isPlatformAdmin } from "@/lib/db/platform-admins";
import { AppHeader } from "@/components/AppHeader";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SupportLink } from "@/components/support/SupportLink";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { buildNavLinks, getCurrentPath } from "@/lib/nav";
import { StaffChatPanel } from "@/components/ai/StaffChatPanel";
import { isAiEnabled } from "@/lib/ai/model";
import { needsProfile } from "@/lib/profile/gate";
import { ProfileLink } from "@/components/profile/ProfileLink";
import { hasPermission } from "@/lib/permissions";

interface StaffShellProps {
  user: StaffUserRecord;
  withChat: boolean;
  children: ReactNode;
}

/**
 * Shared chrome for signed-in staff pages: demo banner, header with nav, optional AI chat.
 * Staff who still owe their school a profile are sent to /profile first (it lives outside
 * this shell, so there is no loop).
 */
export async function StaffShell({ user, withChat, children }: StaffShellProps) {
  if (await needsProfile(user)) redirect("/profile");
  const [platform, currentPath, t, school, canBookRooms] = await Promise.all([
    isPlatformAdmin(user.id),
    getCurrentPath(),
    getTranslations("nav"),
    user.schoolId ? getSchoolById(user.schoolId) : null,
    hasPermission(user, "rooms.book"),
  ]);
  const navLinks = await buildNavLinks(user.role, platform, school?.services, canBookRooms);
  return (
    <>
      {user.demoExpiresAt && <DemoBanner expiresAt={user.demoExpiresAt} />}
      <div className="print:hidden">
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
            <ProfileLink user={user} />
            <LogoutButton label={t("logout")} />
          </>
        }
      />
      </div>
      {children}
      {withChat && isAiEnabled() && !isDemoUser(user) && <StaffChatPanel />}
    </>
  );
}
