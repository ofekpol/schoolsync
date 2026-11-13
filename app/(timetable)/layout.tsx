import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { requireActiveStaff } from "@/lib/auth/require-staff";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { getSchoolById } from "@/lib/db/schools";
import { hasService } from "@/lib/services";
import { StaffEntryLoading } from "@/components/staff/StaffEntryLoading";
import { StaffShell } from "@/components/staff/StaffShell";

/**
 * timeTable route group layout: active staff of a school with `timetable` only.
 * Demo users and schools without the service get the not-found page.
 */
export default function TimetableLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<StaffEntryLoading />}>
      <TimetableLayoutContent>{children}</TimetableLayoutContent>
    </Suspense>
  );
}

async function TimetableLayoutContent({ children }: { children: ReactNode }) {
  const user = await requireActiveStaff();
  const school = user.schoolId ? await getSchoolById(user.schoolId) : null;
  if (!school || !hasService(school, "timetable") || isDemoUser(user)) notFound();
  return (
    <StaffShell user={user} withChat={false}>
      {children}
    </StaffShell>
  );
}
