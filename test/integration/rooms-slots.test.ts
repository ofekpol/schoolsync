import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roomBookings } from "@/lib/db/schema-rooms";
import { RoomsError } from "@/lib/rooms/errors";
import { listSlots, releaseSlot, setSlot, unreleaseSlot } from "@/lib/rooms/slots";
import { RoomsFixture, jsonRequest } from "./rooms-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

import { GET, PUT } from "@/app/api/v1/rooms/[id]/slots/route";
import { DELETE as DELETE_SLOT } from "@/app/api/v1/rooms/slots/[slotId]/route";
import { DELETE as UNRELEASE, POST as RELEASE } from "@/app/api/v1/rooms/slots/[slotId]/releases/route";

const fx = new RoomsFixture(testSchoolA);
const fxB = new RoomsFixture(testSchoolB);
// "Now" is Sunday 2026-11-29 10:00 Jerusalem; 2026-12-01 is the coming Tuesday.
const NOW = new Date("2026-11-29T08:00:00Z");
const TUESDAY = "2026-12-01";

describe.skipIf(skipIfNoTestDb)("weekly room slots and releases", () => {
  let roomId: string;
  let managerId: string;

  beforeEach(async () => {
    if (shouldSkip()) return;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await fx.cleanup();
    await fxB.cleanup();
    await fx.enableRooms();
    await fx.setWeek();
    await fx.activeYear();
    roomId = await fx.room("מעבדה");
    const manager = await fx.staff("viewer", ["rooms.manage"]);
    managerId = manager.id;
    getStaffUserMock.mockReset();
    getStaffUserMock.mockResolvedValue(manager);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (shouldSkip()) return;
    await fx.cleanup();
    await fxB.cleanup();
  });

  const slot = (period = 3) => ({ day: 2, period, label: "ז1 מדעים" });

  it("sets a slot through the route and lists it with the staff member's name", async () => {
    const teacher = await fx.staff("editor");
    const res = await PUT(
      jsonRequest(`/api/v1/rooms/${roomId}/slots`, "PUT", { ...slot(), staffUserId: teacher.id }),
      { params: Promise.resolve({ id: roomId }) },
    );
    expect(res.status).toBe(200);
    const listed = await GET(jsonRequest(`/api/v1/rooms/${roomId}/slots`, "GET"), { params: Promise.resolve({ id: roomId }) });
    const { slots } = (await listed.json()) as { slots: { label: string; staffName: string | null }[] };
    expect(slots).toEqual([expect.objectContaining({ day: 2, period: 3, label: "ז1 מדעים", staffName: teacher.fullName })]);
  });

  it("upserts on the same day and period", async () => {
    await setSlot(testSchoolA, roomId, slot(), managerId);
    await setSlot(testSchoolA, roomId, { ...slot(), label: "ח2" }, managerId);
    expect((await listSlots(testSchoolA, roomId)).map((s) => s.label)).toEqual(["ח2"]);
  });

  it("refuses a day and period outside the week", async () => {
    await expect(setSlot(testSchoolA, roomId, { day: 6, period: 1, label: "x" }, managerId)).rejects.toEqual(
      new RoomsError("not_in_week"),
    );
    await expect(setSlot(testSchoolA, roomId, { day: 2, period: 7, label: "x" }, managerId)).rejects.toEqual(
      new RoomsError("not_in_week"),
    );
  });

  it("refuses with no active academic year", async () => {
    await fx.cleanup();
    await fx.enableRooms();
    await fx.setWeek();
    const room = await fx.room();
    await expect(setSlot(testSchoolA, room, slot(), managerId)).rejects.toEqual(new RoomsError("no_active_year"));
  });

  it("refuses a staff member from another school", async () => {
    const outsider = await fxB.staff("editor");
    await expect(setSlot(testSchoolA, roomId, { ...slot(), staffUserId: outsider.id }, managerId)).rejects.toEqual(
      new RoomsError("invalid_staff"),
    );
  });

  it("releases a slot on a matching future date only", async () => {
    const { id } = (await setSlot(testSchoolA, roomId, slot(), managerId))!;
    await expect(releaseSlot(testSchoolA, id, "2026-12-02", managerId)).rejects.toEqual(new RoomsError("not_in_week"));
    await expect(releaseSlot(testSchoolA, id, "2026-11-24", managerId)).rejects.toEqual(new RoomsError("out_of_range"));
    const res = await RELEASE(jsonRequest(`/api/v1/rooms/slots/${id}/releases`, "POST", { date: TUESDAY }), {
      params: Promise.resolve({ slotId: id }),
    });
    expect(res.status).toBe(204);
    expect((await listSlots(testSchoolA, roomId))[0].releasedDates).toEqual([TUESDAY]);
  });

  it("will not take back a release once someone booked that date", async () => {
    const { id } = (await setSlot(testSchoolA, roomId, slot(), managerId))!;
    await releaseSlot(testSchoolA, id, TUESDAY, managerId);
    await testDb!.insert(roomBookings).values({
      schoolId: testSchoolA, roomId, groupId: randomUUID(), date: TUESDAY, period: 3, staffUserId: managerId,
    });
    await expect(unreleaseSlot(testSchoolA, id, TUESDAY)).rejects.toEqual(new RoomsError("slot_taken"));
    const res = await UNRELEASE(jsonRequest(`/api/v1/rooms/slots/${id}/releases?date=${TUESDAY}`, "DELETE"), {
      params: Promise.resolve({ slotId: id }),
    });
    expect(res.status).toBe(409);
  });

  it("deletes a slot; another school's slot is 404", async () => {
    const { id } = (await setSlot(testSchoolA, roomId, slot(), managerId))!;
    const ok = await DELETE_SLOT(jsonRequest(`/api/v1/rooms/slots/${id}`, "DELETE"), { params: Promise.resolve({ slotId: id }) });
    expect(ok.status).toBe(204);
    expect(await listSlots(testSchoolA, roomId)).toEqual([]);

    getStaffUserMock.mockResolvedValue(await fxB.staff("admin"));
    await fxB.enableRooms();
    const again = (await setSlot(testSchoolA, roomId, slot(), managerId))!;
    const foreign = await DELETE_SLOT(jsonRequest(`/api/v1/rooms/slots/${again.id}`, "DELETE"), {
      params: Promise.resolve({ slotId: again.id }),
    });
    expect(foreign.status).toBe(404);
  });

  it("needs rooms.manage", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    const res = await PUT(jsonRequest(`/api/v1/rooms/${roomId}/slots`, "PUT", slot()), { params: Promise.resolve({ id: roomId }) });
    expect(res.status).toBe(403);
  });
});
