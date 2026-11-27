import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { roomBookings, rooms } from "@/lib/db/schema-rooms";
import type { StaffUserRecord } from "@/lib/db/staff";
import { releaseSlot, setSlot } from "@/lib/rooms/slots";
import { RoomsFixture, jsonRequest } from "./rooms-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA } from "./setup";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

import { GET, POST } from "@/app/api/v1/rooms/bookings/route";
import { DELETE } from "@/app/api/v1/rooms/bookings/[groupId]/route";

const fx = new RoomsFixture(testSchoolA);
// Tuesday 2026-12-01, 09:00 Jerusalem (07:00Z): period 1 (08:00–08:45) is over, period 2 is not.
const NOW = new Date("2026-12-01T07:00:00Z");
const TODAY = "2026-12-01";
const NEXT_TUESDAY = "2026-12-08";

function book(body: Record<string, unknown>) {
  return POST(jsonRequest("/api/v1/rooms/bookings", "POST", body));
}
async function errorOf(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe.skipIf(skipIfNoTestDb)("room bookings", () => {
  let roomId: string;
  let teacher: StaffUserRecord;

  beforeEach(async () => {
    if (shouldSkip()) return;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await fx.cleanup();
    await fx.enableRooms();
    await fx.setWeek();
    await fx.activeYear("2026-09-01", "2027-06-30");
    roomId = await fx.room("מעבדה");
    teacher = await fx.staff("viewer", ["rooms.book"]);
    getStaffUserMock.mockReset();
    getStaffUserMock.mockResolvedValue(teacher);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (!shouldSkip()) await fx.cleanup();
  });

  const activeRows = () =>
    testDb!.select().from(roomBookings).where(and(eq(roomBookings.roomId, roomId), isNull(roomBookings.canceledAt)));

  it("books consecutive periods as one group", async () => {
    const res = await book({ roomId, date: NEXT_TUESDAY, periods: [4, 3], note: " מבחן " });
    expect(res.status).toBe(201);
    const { groupId } = (await res.json()) as { groupId: string };
    const rows = await activeRows();
    expect(rows.map((r) => r.period).sort()).toEqual([3, 4]);
    expect(rows.every((r) => r.groupId === groupId && r.note === "מבחן")).toBe(true);
  });

  it("rejects non-consecutive or repeated periods", async () => {
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [2, 4] })).status).toBe(400);
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [3, 3] })).status).toBe(400);
  });

  it("refuses dates before today or after the active year", async () => {
    expect(await errorOf(await book({ roomId, date: "2026-11-24", periods: [3] }))).toEqual({ status: 422, body: { error: "out_of_range" } });
    expect(await errorOf(await book({ roomId, date: "2027-07-06", periods: [3] }))).toEqual({ status: 422, body: { error: "out_of_range" } });
  });

  it("refuses a day the school has no periods on", async () => {
    expect(await errorOf(await book({ roomId, date: "2026-12-05", periods: [1] }))).toEqual({ status: 400, body: { error: "not_in_week" } });
  });

  it("refuses a period of today that is already over", async () => {
    expect(await errorOf(await book({ roomId, date: TODAY, periods: [1] }))).toEqual({ status: 422, body: { error: "period_over" } });
    expect((await book({ roomId, date: TODAY, periods: [2] })).status).toBe(201);
  });

  it("refuses a weekly slot unless it was released for that date", async () => {
    const manager = await fx.staff("admin");
    const slot = (await setSlot(testSchoolA, roomId, { day: 2, period: 5, label: "ז1" }, manager.id))!;
    expect(await errorOf(await book({ roomId, date: NEXT_TUESDAY, periods: [5] }))).toEqual({ status: 409, body: { error: "slot_taken" } });
    await releaseSlot(testSchoolA, slot.id, NEXT_TUESDAY, manager.id);
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [5] })).status).toBe(201);
    expect((await book({ roomId, date: "2026-12-15", periods: [5] })).status).toBe(409);
  });

  it("is all or nothing: [3,4] with 4 taken leaves no row for 3", async () => {
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [4] })).status).toBe(201);
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [3, 4] })).status).toBe(409);
    expect((await activeRows()).map((r) => r.period)).toEqual([4]);
  });

  it("lets exactly one of two concurrent identical requests win", async () => {
    const results = await Promise.all([
      book({ roomId, date: NEXT_TUESDAY, periods: [3] }),
      book({ roomId, date: NEXT_TUESDAY, periods: [3] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("404 for an archived room", async () => {
    await testDb!.update(rooms).set({ archivedAt: new Date() }).where(eq(rooms.id, roomId));
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [3] })).status).toBe(404);
  });

  it("only the owner or a room manager cancels; the period frees up", async () => {
    const { groupId } = (await (await book({ roomId, date: NEXT_TUESDAY, periods: [3] })).json()) as { groupId: string };
    const ctx = { params: Promise.resolve({ groupId }) };
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    expect(await errorOf(await DELETE(jsonRequest(`/api/v1/rooms/bookings/${groupId}`, "DELETE"), ctx))).toEqual({
      status: 403, body: { error: "not_yours" },
    });
    const manager = await fx.staff("viewer", ["rooms.manage"]);
    getStaffUserMock.mockResolvedValue(manager);
    expect((await DELETE(jsonRequest(`/api/v1/rooms/bookings/${groupId}`, "DELETE"), ctx)).status).toBe(204);
    const [row] = await testDb!.select().from(roomBookings).where(eq(roomBookings.groupId, groupId));
    expect(row.canceledBy).toBe(manager.id);
    getStaffUserMock.mockResolvedValue(teacher);
    expect((await book({ roomId, date: NEXT_TUESDAY, periods: [3] })).status).toBe(201);
  });

  it("lists only the caller's upcoming, active groups", async () => {
    await book({ roomId, date: NEXT_TUESDAY, periods: [3, 4], note: "שלי" });
    const { groupId } = (await (await book({ roomId, date: NEXT_TUESDAY, periods: [6] })).json()) as { groupId: string };
    await DELETE(jsonRequest(`/api/v1/rooms/bookings/${groupId}`, "DELETE"), { params: Promise.resolve({ groupId }) });
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    await book({ roomId, date: NEXT_TUESDAY, periods: [1] });
    getStaffUserMock.mockResolvedValue(teacher);

    const res = await GET(jsonRequest(`/api/v1/rooms/bookings?mine=1&from=${TODAY}`, "GET"));
    const { bookings } = (await res.json()) as { bookings: { periods: number[]; note: string | null; roomName: string }[] };
    expect(bookings).toEqual([expect.objectContaining({ periods: [3, 4], note: "שלי", roomName: "מעבדה", date: NEXT_TUESDAY })]);
  });
});
