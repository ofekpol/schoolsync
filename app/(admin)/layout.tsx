import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth/require-staff";
import { StaffShell } from "@/components/staff/StaffShell";
import type { ReactNode } from "react";

/**
 * Admin route group layout.
 * AUTH guard: redirects unauthenticated users to /auth/login.
 * STATUS guard: pending users → /auth/pending; deactivated → /auth/deactivated.
 * ROLE guard: redirects viewers to /dashboard. Per-page guards enforce
 * admin-only access for staff/year; event-types also allows editors.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireActiveStaff();
  if (user.role === "viewer") redirect("/dashboard");
  return (
    <div className="min-h-screen">
      <StaffShell user={user} withChat={false}>
        {children}
      </StaffShell>
    </div>
  );
}
