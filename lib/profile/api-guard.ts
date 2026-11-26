import "server-only";
import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";
import type { StaffUserRecord } from "@/lib/db/staff";
import { CategoryError } from "@/lib/profile/categories";
import { ProfileValidationError, setStaffOptions } from "@/lib/profile/staff-labels";
import { guardFailureResponse } from "@/lib/auth/thrown-response";

type Guarded<U> = { user: U; response?: undefined } | { user?: undefined; response: NextResponse };
type SchoolUser = StaffUserRecord & { schoolId: string };

/** The signed-in active admin, or the 401/403 to return. Writes are off in demo schools. */
export async function requireCategoryAdmin(write: boolean): Promise<Guarded<SchoolUser>> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    return { response: guardFailureResponse(e) };
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

const CATEGORY_ERROR_STATUS: Record<CategoryError["code"], number> = {
  duplicate_name: 409,
  limit_reached: 422,
  permissions_need_admin_assigned: 400,
};

/** 409 for a taken name, 422 at the category limit, 400 for misplaced permissions; null otherwise. */
export function categoryErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof CategoryError)) return null;
  const status = CATEGORY_ERROR_STATUS[error.code];
  return NextResponse.json({ error: error.code }, { status });
}

export function invalidInput(details?: unknown): NextResponse {
  return NextResponse.json({ error: "Invalid input", details }, { status: 400 });
}

/** Saves a selection: 204, or 400 with the ProfileValidationError code. */
export async function saveStaffOptions(
  schoolId: string,
  staffUserId: string,
  optionIds: string[],
): Promise<NextResponse> {
  try {
    await setStaffOptions(schoolId, staffUserId, optionIds);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ProfileValidationError) {
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    throw e;
  }
}
