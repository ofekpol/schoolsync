import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { roomBookings, roomWeeklySlots } from "@/lib/db/schema-rooms";
import { RoomsError } from "@/lib/rooms/errors";
import { getWeek, saveWeek } from "@/lib/rooms/week";
import { RoomsFixture, TEST_WEEK, jsonRequest } from "./rooms-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA } from "./setup";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

import { GET, PUT } from "@/app/api/v1/rooms/week/route";

const fx = new RoomsFixture(testSchoolA);

describe.skipIf(skipIfNoTestDb)("rooms guard and school week", () => {
  beforeEach(async () => {
    if (shouldSkip()) return;
    await fx.cleanup();
    await fx.enableRooms();
    await fx.setWeek();
    getStaffUserMock.mockReset();
  });
  afterAll(async () => {
    if (!shouldSkip()) await fx.cleanup();
  });

  it("401 with no user", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 for an active editor with no labels", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("editor"));
    expect((await GET()).status).toBe(403);
  });

  it("403 service_disabled when the school lacks rooms", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    await fx.enableRooms(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "service_disabled" });
  });

  it("200 with the week for a viewer holding rooms.book", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ week: TEST_WEEK });
  });

  it("403 for a deactivated staff member who still holds a booking label", async () => {
    const user = await fx.staff("viewer", ["rooms.book"]);
    getStaffUserMock.mockResolvedValue({ ...user, status: "deactivated" });
    expect((await GET()).status).toBe(403);
  });

  it("PUT needs rooms.manage; a manager saves the week", async () => {
    const week = { days: [{ day: 1, periods: [{ period: 1, start: "08:00", end: "08:45" }] }] };
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    expect((await PUT(jsonRequest("/api/v1/rooms/week", "PUT", { week }))).status).toBe(403);

    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.manage"]));
    expect((await PUT(jsonRequest("/api/v1/rooms/week", "PUT", { week: { days: [] } }))).status).toBe(400);
    expect((await PUT(jsonRequest("/api/v1/rooms/week", "PUT", { week }))).status).toBe(204);
    expect(await getWeek(testSchoolA)).toEqual(week);
  });

  it("refuses dropping a period a weekly slot or a future booking uses", async () => {
    const staff = await fx.staff("admin");
    const yearId = await fx.activeYear();
    const roomId = await fx.room();
    const withoutSundaySix = {
      days: TEST_WEEK.days.map((d) => (d.day === 0 ? { ...d, periods: d.periods.slice(0, 5) } : d)),
    };
    const [slot] = await testDb!
      .insert(roomWeeklySlots)
      .values({ schoolId: testSchoolA, roomId, academicYearId: yearId, day: 0, period: 6, label: "ז1", createdBy: staff.id })
      .returning();
    await expect(saveWeek(testSchoolA, withoutSundaySix)).rejects.toEqual(new RoomsError("period_in_use"));

    await testDb!.delete(roomWeeklySlots).where(eq(roomWeeklySlots.id, slot.id));
    // 2099-01-04 is a Sunday, always in the future.
    await testDb!.insert(roomBookings).values({
      schoolId: testSchoolA, roomId, groupId: randomUUID(), date: "2099-01-04", period: 6, staffUserId: staff.id,
    });
    await expect(saveWeek(testSchoolA, withoutSundaySix)).rejects.toEqual(new RoomsError("period_in_use"));
  });
});
