import "server-only";
import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";
import type { StaffUserRecord } from "@/lib/db/staff";
import { CategoryError } from "@/lib/profile/categories";

type Guarded<U> = { user: U; response?: undefined } | { user?: undefined; response: NextResponse };
type SchoolUser = StaffUserRecord & { schoolId: string };

/** The signed-in active admin, or the 401/403 to return. Writes are off in demo schools. */
export async function requireCategoryAdmin(write: boolean): Promise<Guarded<SchoolUser>> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) {
      return { response: NextResponse.json({ error: "Forbidden" }, { status: e.status }) };
    }
    throw e;
  }
  if (write && isDemoUser(user)) return { response: demoDisabledResponse() };
  return { user };
}

/** Any active staff member of a school (every role), or the 401/403 to return. */
export async function requireActiveStaff(write: boolean): Promise<Guarded<SchoolUser>> {
  const user = await getStaffUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.schoolId || user.status !== "active") {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (write && isDemoUser(user)) return { response: demoDisabledResponse() };
  return { user: user as SchoolUser };
}

/** 409 for a taken name, 422 at the category limit; null for anything else. */
export function categoryErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof CategoryError)) return null;
  const status = error.code === "duplicate_name" ? 409 : 422;
  return NextResponse.json({ error: error.code }, { status });
}

export function invalidInput(details?: unknown): NextResponse {
  return NextResponse.json({ error: "Invalid input", details }, { status: 400 });
}
