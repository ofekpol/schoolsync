import "server-only";
import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import type { StaffUserRecord } from "@/lib/db/staff";
import { hasPermission, type Permission } from "@/lib/permissions";

export type SchoolUser = StaffUserRecord & { schoolId: string };

type Guarded = { ok: true; user: SchoolUser } | { ok: false; response: NextResponse };

const forbidden = (): NextResponse => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** 401, then 403 (no school or inactive, `service_disabled`, missing permission, demo write). */
export async function requireRoomsPermission(permission: Permission, write: boolean): Promise<Guarded> {
  const user = await getStaffUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.schoolId || user.status !== "active") return { ok: false, response: forbidden() };
  const disabled = await serviceDisabledResponse(user.schoolId, "rooms");
  if (disabled) return { ok: false, response: disabled };
  if (!(await hasPermission(user, permission))) return { ok: false, response: forbidden() };
  if (write && isDemoUser(user)) return { ok: false, response: demoDisabledResponse() };
  return { ok: true, user: user as SchoolUser };
}

export function invalidInput(details?: unknown): NextResponse {
  return NextResponse.json({ error: "Invalid input", details }, { status: 400 });
}

export function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
