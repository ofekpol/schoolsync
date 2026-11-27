import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";
import { profileCategories, profileCategoryOptions, staffProfileOptions } from "@/lib/db/schema-profile";
import { rooms, roomsWeek } from "@/lib/db/schema-rooms";
import type { StaffUserRecord } from "@/lib/db/staff";
import type { Permission } from "@/lib/permissions/catalog";
import type { Week } from "@/lib/rooms/week-schema";
import { testDb } from "./setup";

const p = (period: number, start: string, end: string) => ({ period, start, end });

/** Tuesday periods 1–6 (period 1 ends 08:45), Sunday 1–6. */
export const TEST_WEEK: Week = {
  days: [0, 2].map((day) => ({
    day,
    periods: [
      p(1, "08:00", "08:45"),
      p(2, "08:50", "09:35"),
      p(3, "09:40", "10:25"),
      p(4, "10:30", "11:15"),
      p(5, "11:20", "12:05"),
      p(6, "12:10", "12:55"),
    ],
  })),
};

/** Tracks what a test file created in a school so `cleanup` removes it. */
export class RoomsFixture {
  private staffIds: string[] = [];
  private categoryIds: string[] = [];
  private yearIds: string[] = [];

  constructor(readonly schoolId: string) {}

  /** An active staff member holding `permissions` through an admin-assigned label. */
  async staff(
    role: StaffUserRecord["role"] = "viewer",
    permissions: Permission[] = [],
  ): Promise<StaffUserRecord & { schoolId: string }> {
    const id = randomUUID();
    const record = {
      id,
      schoolId: this.schoolId,
      role,
      status: "active" as const,
      email: `rooms-${id}@test`,
      fullName: `Staff ${id.slice(0, 6)}`,
      mustChangePassword: false,
    };
    await testDb!.insert(schema.staffUsers).values(record);
    this.staffIds.push(id);
    if (permissions.length > 0) await this.grant(id, permissions);
    return record;
  }

  private async grant(staffUserId: string, permissions: Permission[]): Promise<void> {
    const [category] = await testDb!
      .insert(profileCategories)
      .values({ schoolId: this.schoolId, name: `rooms-${randomUUID()}`, adminAssigned: true })
      .returning();
    this.categoryIds.push(category.id);
    const [option] = await testDb!
      .insert(profileCategoryOptions)
      .values({ schoolId: this.schoolId, categoryId: category.id, label: "role", permissions })
      .returning();
    await testDb!.insert(staffProfileOptions).values({ staffUserId, optionId: option.id, schoolId: this.schoolId });
  }

  async enableRooms(on = true): Promise<void> {
    const services = on ? "{gantt,rooms}" : "{gantt}";
    await testDb!.execute(sql`UPDATE schools SET services = ${services}::text[] WHERE id = ${this.schoolId}`);
  }

  async setWeek(week: Week = TEST_WEEK): Promise<void> {
    await testDb!
      .insert(roomsWeek)
      .values({ schoolId: this.schoolId, week })
      .onConflictDoUpdate({ target: roomsWeek.schoolId, set: { week } });
  }

  /** Creates an academic year and makes it the school's active one. */
  async activeYear(startDate = "2026-09-01", endDate = "2027-06-30"): Promise<string> {
    const id = randomUUID();
    await testDb!.insert(schema.academicYears).values({
      id,
      schoolId: this.schoolId,
      label: `rooms-${id}`,
      startDate,
      endDate,
    });
    this.yearIds.push(id);
    await testDb!.update(schema.schools).set({ activeAcademicYearId: id }).where(eq(schema.schools.id, this.schoolId));
    return id;
  }

  async room(name = `room-${randomUUID().slice(0, 8)}`): Promise<string> {
    const [row] = await testDb!.insert(rooms).values({ schoolId: this.schoolId, name }).returning();
    return row.id;
  }

  async cleanup(): Promise<void> {
    await testDb!.delete(rooms).where(eq(rooms.schoolId, this.schoolId));
    await testDb!.delete(roomsWeek).where(eq(roomsWeek.schoolId, this.schoolId));
    await testDb!.update(schema.schools).set({ activeAcademicYearId: null }).where(eq(schema.schools.id, this.schoolId));
    await this.enableRooms(false);
    if (this.yearIds.length) await testDb!.delete(schema.academicYears).where(inArray(schema.academicYears.id, this.yearIds));
    if (this.categoryIds.length) {
      await testDb!.delete(profileCategories).where(inArray(profileCategories.id, this.categoryIds));
    }
    if (this.staffIds.length) {
      await testDb!.delete(schema.auditLog).where(inArray(schema.auditLog.actorStaffId, this.staffIds));
      await testDb!.delete(schema.staffUsers).where(inArray(schema.staffUsers.id, this.staffIds));
    }
    this.staffIds = [];
    this.categoryIds = [];
    this.yearIds = [];
  }
}

export function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
