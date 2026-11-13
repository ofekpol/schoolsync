import { requireActiveStaffPage } from "@/lib/auth/require-staff";
import { StaffEntryLoading } from "@/components/staff/StaffEntryLoading";
import { StaffShell } from "@/components/staff/StaffShell";
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
  const user = await requireActiveStaffPage();
  return (
    <StaffShell user={user} withChat>
      {children}
    </StaffShell>
  );
}
