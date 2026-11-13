import "server-only";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { AppHeaderNavLink } from "@/components/AppHeader";
import type { Service } from "@/lib/services";

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
 * get a link to /platform/schools. Gantt links show only when the school has
 * `gantt`; the timeTable link only when it has `timetable`.
 */
export async function buildNavLinks(
  role: "editor" | "admin" | "viewer",
  isPlatformAdmin = false,
  services: readonly Service[] = ["gantt"],
): Promise<AppHeaderNavLink[]> {
  const t = await getTranslations("nav");
  const gantt = services.includes("gantt");
  const timetableLink = { href: "/timetable", label: t("timetable") };
  const links: AppHeaderNavLink[] = [gantt ? { href: "/dashboard", label: t("dashboard") } : timetableLink];
  if (role === "admin") {
    links.push({ href: "/admin/staff", label: t("staff") });
  }
  if (gantt && (role === "admin" || role === "editor")) {
    links.push({ href: "/admin/event-types", label: t("eventTypes") });
  }
  if (gantt && services.includes("timetable")) {
    links.push(timetableLink);
  }
  if (isPlatformAdmin) {
    links.push({ href: "/platform/schools", label: t("platform") });
  }
  return links;
}
