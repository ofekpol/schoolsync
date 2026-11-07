import "server-only";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { AppHeaderNavLink } from "@/components/AppHeader";

/**
 * Returns the request pathname stamped by middleware ("x-pathname"),
 * or an empty string when unavailable (e.g. in tests).
 */
export async function getCurrentPath(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") ?? "";
}

/**
 * Builds the in-header nav for a staff or admin user. Admins also see
 * the admin-only sections (Staff, Event Types, Year); platform admins also
 * get a link to /platform/schools.
 */
export async function buildNavLinks(
  role: "editor" | "admin" | "viewer",
  isPlatformAdmin = false,
): Promise<AppHeaderNavLink[]> {
  const t = await getTranslations("nav");
  const links: AppHeaderNavLink[] = [
    { href: "/dashboard", label: t("dashboard") },
  ];
  if (role === "admin") {
    links.push({ href: "/admin/staff", label: t("staff") });
  }
  if (role === "admin" || role === "editor") {
    links.push({ href: "/admin/event-types", label: t("eventTypes") });
  }
  if (isPlatformAdmin) {
    links.push({ href: "/platform/schools", label: t("platform") });
  }
  return links;
}
