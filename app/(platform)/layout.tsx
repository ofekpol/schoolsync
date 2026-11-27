import { getTranslations } from "next-intl/server";
import { getSession, getStaffUser } from "@/lib/auth/session";
import { getSchoolById } from "@/lib/db/schools";
import { AppHeader } from "@/components/AppHeader";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { buildNavLinks, getCurrentPath } from "@/lib/nav";
import { hasPermission } from "@/lib/permissions";
import type { ReactNode } from "react";

/**
 * Platform route group layout. Renders the shared app header so platform
 * admins can navigate back to the staff area. Access control stays in the
 * pages (`requirePlatformAdmin`), since a platform admin needn't have a
 * `staff_users` row; without one the header only links to /platform/schools.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const [authUser, user, currentPath, t] = await Promise.all([
    getSession(),
    getStaffUser(),
    getCurrentPath(),
    getTranslations("nav"),
  ]);
  if (!authUser) return children;
  const [school, canBookRooms] = await Promise.all([
    user?.schoolId ? getSchoolById(user.schoolId) : null,
    hasPermission(user, "rooms.book"),
  ]);
  const navLinks = user
    ? await buildNavLinks(user.role, true, school?.services, canBookRooms)
    : [{ href: "/platform/schools", label: t("platform") }];
  const name = user?.fullName ?? authUser.email ?? "";
  return (
    <div className="min-h-screen">
      <AppHeader
        title={school?.name ?? name}
        subtitle={authUser.email}
        navLinks={navLinks}
        currentPath={currentPath}
        rightSlot={
          <>
            <span className="max-w-48 truncate text-sm font-medium text-neutral-900">{name}</span>
            <LogoutButton label={t("logout")} />
          </>
        }
      />
      {children}
    </div>
  );
}
