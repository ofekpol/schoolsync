import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  roomBookings,
  roomSlotReleases,
  roomWeeklySlots,
  rooms,
  roomsWeek,
} from "@/lib/db/schema-rooms";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const WEEK = { days: [{ day: 2, periods: [{ period: 1, start: "08:00", end: "08:45" }] }] };

/** RLS for the five rooms tables: own rows visible, other school's hidden, cross-school writes refused. */
describe.skipIf(skipIfNoTestDb)("rooms tables RLS", () => {
  const staffId = randomUUID();
  const yearId = randomUUID();
  let roomId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await testDb!.insert(schema.staffUsers).values({
      id: staffId,
      schoolId: testSchoolA,
      email: `rooms-rls-${staffId}@test`,
      fullName: "Rooms RLS",
      role: "editor",
      status: "active",
    });
    await testDb!.insert(schema.academicYears).values({
      id: yearId,
      schoolId: testSchoolA,
      label: `rooms-rls-${yearId}`,
      startDate: "2026-09-01",
      endDate: "2027-06-30",
    });
    await withSchool(testSchoolA, async (tx) => {
      await tx
        .insert(roomsWeek)
        .values({ schoolId: testSchoolA, week: WEEK })
        .onConflictDoUpdate({ target: roomsWeek.schoolId, set: { week: WEEK } });
      const [room] = await tx.insert(rooms).values({ schoolId: testSchoolA, name: `rls-${staffId}` }).returning();
      roomId = room.id;
      const [slot] = await tx
        .insert(roomWeeklySlots)
        .values({ schoolId: testSchoolA, roomId, academicYearId: yearId, day: 2, period: 1, label: "ז1", createdBy: staffId })
        .returning();
      slotId = slot.id;
      await tx.insert(roomSlotReleases).values({ slotId, date: "2026-12-01", schoolId: testSchoolA, releasedBy: staffId });
      const [booking] = await tx
        .insert(roomBookings)
        .values({ schoolId: testSchoolA, roomId, groupId: randomUUID(), date: "2026-12-08", period: 1, staffUserId: staffId })
        .returning();
      bookingId = booking.id;
    });
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await testDb!.delete(rooms).where(eq(rooms.id, roomId));
    await testDb!.delete(roomsWeek).where(eq(roomsWeek.schoolId, testSchoolA));
    await testDb!.delete(schema.academicYears).where(eq(schema.academicYears.id, yearId));
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, staffId));
  });

  async function counts(schoolId: string) {
    return withSchool(schoolId, async (tx) => ({
      week: (await tx.select().from(roomsWeek).where(eq(roomsWeek.schoolId, testSchoolA))).length,
      rooms: (await tx.select().from(rooms).where(eq(rooms.id, roomId))).length,
      slots: (await tx.select().from(roomWeeklySlots).where(eq(roomWeeklySlots.id, slotId))).length,
      releases: (await tx.select().from(roomSlotReleases).where(eq(roomSlotReleases.slotId, slotId))).length,
      bookings: (await tx.select().from(roomBookings).where(eq(roomBookings.id, bookingId))).length,
    }));
  }

  it("lets a school read its own rows in all five tables", async () => {
    expect(await counts(testSchoolA)).toEqual({ week: 1, rooms: 1, slots: 1, releases: 1, bookings: 1 });
  });

  it("hides another school's rows in all five tables", async () => {
    expect(await counts(testSchoolB)).toEqual({ week: 0, rooms: 0, slots: 0, releases: 0, bookings: 0 });
  });

  it("refuses writing school A rows from inside school B", async () => {
    const asB = (fn: Parameters<typeof withSchool>[1]) => withSchool(testSchoolB, fn);
    await expect(asB((tx) => tx.insert(rooms).values({ schoolId: testSchoolA, name: `x-${randomUUID()}` }))).rejects.toThrow();
    await expect(
      asB((tx) =>
        tx.insert(roomBookings).values({
          schoolId: testSchoolA, roomId, groupId: randomUUID(), date: "2026-12-15", period: 1, staffUserId: staffId,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      asB((tx) => tx.insert(roomSlotReleases).values({ slotId, date: "2026-12-15", schoolId: testSchoolA, releasedBy: staffId })),
    ).rejects.toThrow();
    await expect(
      asB((tx) =>
        tx.insert(roomWeeklySlots).values({
          schoolId: testSchoolA, roomId, academicYearId: yearId, day: 2, period: 2, label: "x", createdBy: staffId,
        }),
      ),
    ).rejects.toThrow();
    await expect(asB((tx) => tx.insert(roomsWeek).values({ schoolId: testSchoolA, week: WEEK }))).rejects.toThrow();
  });

  it("allows one active booking per room, date and period", async () => {
    await expect(
      withSchool(testSchoolA, (tx) =>
        tx.insert(roomBookings).values({
          schoolId: testSchoolA, roomId, groupId: randomUUID(), date: "2026-12-08", period: 1, staffUserId: staffId,
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a day or period out of range and an over-long name", async () => {
    await expect(
      withSchool(testSchoolA, (tx) => tx.insert(rooms).values({ schoolId: testSchoolA, name: "x".repeat(61) })),
    ).rejects.toThrow();
    await expect(
      withSchool(testSchoolA, (tx) =>
        tx.insert(roomWeeklySlots).values({
          schoolId: testSchoolA, roomId, academicYearId: yearId, day: 7, period: 1, label: "x", createdBy: staffId,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withSchool(testSchoolA, (tx) =>
        tx.insert(roomBookings).values({
          schoolId: testSchoolA, roomId, groupId: randomUUID(), date: "2026-12-22", period: 13, staffUserId: staffId,
        }),
      ),
    ).rejects.toThrow();
  });
});
