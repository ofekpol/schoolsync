import { getTranslations } from "next-intl/server";
import type { StaffUserRecord } from "@/lib/auth/session";

const ROLE_KEY = { admin: "roleAdmin", editor: "roleEditor", viewer: "roleViewer" } as const;

/** Up to two initials from the full name (Hebrew or Latin), else the email's first letter. */
function initials(fullName: string, email: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0]).join("");
  return letters || Array.from(email)[0]?.toUpperCase() || "?";
}

/** Who this profile belongs to: monogram, name, email, role and school. */
export async function ProfileIdentity({ user, schoolName }: { user: StaffUserRecord; schoolName?: string }) {
  const t = await getTranslations("admin.staff");
  return (
    <header className="flex items-center gap-4 sm:gap-6">
      <span aria-hidden
        className="grid size-16 shrink-0 place-items-center rounded-full bg-[var(--sg-studio-blue-soft)] font-[family-name:var(--sg-font-display)] text-2xl font-bold text-[var(--sg-accent-ink)] ring-4 ring-[var(--sg-surface)] shadow-[0_6px_16px_rgb(37_99_235_/_14%)] sm:size-20 sm:text-3xl">
        {initials(user.fullName, user.email)}
      </span>
      <div className="min-w-0">
        <h1 className="truncate font-[family-name:var(--sg-font-display)] text-2xl font-bold leading-tight text-[var(--sg-ink)] text-balance sm:text-4xl">
          {user.fullName || user.email}
        </h1>
        <p className="mt-1 truncate text-sm text-[var(--sg-ink-mute)]">
          <bdi>{user.email}</bdi>
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--sg-ink-mute)]">
          <span className="rounded-full bg-[var(--sg-studio-violet-soft)] px-2.5 py-0.5 text-xs font-semibold text-violet-800">
            {t(ROLE_KEY[user.role])}
          </span>
          {schoolName && <span className="truncate">{schoolName}</span>}
        </p>
      </div>
    </header>
  );
}
