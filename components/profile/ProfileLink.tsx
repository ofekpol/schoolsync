import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserRound } from "lucide-react";
import type { StaffUserRecord } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { countCategories } from "@/lib/profile/categories";

/**
 * Header link to the caller's own labels (/profile), next to their name. Shown to
 * editors and viewers, who cannot open staff management; admins edit labels there.
 * Hidden in demo schools and while the school has no profile categories.
 */
export async function ProfileLink({ user }: { user: StaffUserRecord }) {
  if (user.role === "admin" || !user.schoolId || isDemoUser(user)) return null;
  if ((await countCategories(user.schoolId)) === 0) return null;
  const t = await getTranslations("nav");
  return (
    <Link
      href="/profile"
      className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
    >
      <UserRound aria-hidden className="size-4" />
      <span className="sr-only sm:not-sr-only">{t("profile")}</span>
    </Link>
  );
}
