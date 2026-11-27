import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookRoom } from "@/lib/rooms/bookings";
import { releaseSlot, setSlot } from "@/lib/rooms/slots";
import { DayViewSchema } from "@/lib/validations/rooms";
import { RoomsFixture, jsonRequest } from "./rooms-helpers";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

import { GET } from "@/app/api/v1/rooms/route";

const fx = new RoomsFixture(testSchoolA);
const fxB = new RoomsFixture(testSchoolB);
const NOW = new Date("2026-11-29T08:00:00Z");
const TUESDAY = "2026-12-01";

async function day(query: string) {
  const res = await GET(jsonRequest(`/api/v1/rooms?${query}`, "GET"));
  expect(res.status).toBe(200);
  return DayViewSchema.parse(await res.json());
}

describe.skipIf(skipIfNoTestDb)("rooms day view", () => {
  beforeEach(async () => {
    if (shouldSkip()) return;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await fx.cleanup();
    await fxB.cleanup();
    await fx.enableRooms();
    await fx.setWeek();
    await fx.activeYear();
    getStaffUserMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (shouldSkip()) return;
    await fx.cleanup();
    await fxB.cleanup();
  });

  it("shows weekly use, a release for one date only, and bookings with names", async () => {
    const manager = await fx.staff("viewer", ["rooms.manage"]);
    const teacher = await fx.staff("viewer", ["rooms.book"]);
    const lab = await fx.room("מעבדה 1");
    await fx.room("אולם");
    const slot = (await setSlot(testSchoolA, lab, { day: 2, period: 1, label: "ז1", staffUserId: teacher.id }, manager.id))!;
    await setSlot(testSchoolA, lab, { day: 2, period: 2, label: "ח2" }, manager.id);
    await releaseSlot(testSchoolA, slot.id, TUESDAY, manager.id);
    await bookRoom(teacher, { roomId: lab, date: TUESDAY, periods: [3, 4], note: "מבחן" });

    getStaffUserMock.mockResolvedValue(teacher);
    const view = await day(`date=${TUESDAY}`);
    expect(view.periods).toHaveLength(6);
    const labCells = view.rooms.find((r) => r.id === lab)!.cells;
    expect(labCells.slice(0, 4)).toEqual([
      { period: 1, state: "free" },
      expect.objectContaining({ period: 2, state: "weekly", label: "ח2" }),
      expect.objectContaining({ period: 3, state: "booked", staffName: teacher.fullName, note: "מבחן", mine: true }),
      expect.objectContaining({ period: 4, state: "booked", mine: true }),
    ]);

    const nextWeek = await day("date=2026-12-08");
    expect(nextWeek.rooms.find((r) => r.id === lab)!.cells[0]).toMatchObject({ state: "weekly", label: "ז1", staffName: teacher.fullName });

    expect((await day(`date=${TUESDAY}&periods=3,4&free=1`)).rooms.map((r) => r.name)).toEqual(["אולם"]);
    expect((await day(`date=${TUESDAY}&mine=1`)).rooms.map((r) => r.id)).toEqual([lab]);
    expect((await day(`date=${TUESDAY}&q=${encodeURIComponent("מעב")}`)).rooms.map((r) => r.id)).toEqual([lab]);
  });

  it("returns no periods on a day without school, and 400 on a bad query", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    await fx.room();
    expect((await day("date=2026-12-05")).periods).toEqual([]);
    expect((await GET(jsonRequest("/api/v1/rooms?date=tomorrow", "GET"))).status).toBe(400);
    expect((await GET(jsonRequest("/api/v1/rooms?periods=0", "GET"))).status).toBe(400);
  });

  it("a school B user sees none of school A's rooms", async () => {
    await fx.room("מעבדה 1");
    await fxB.enableRooms();
    getStaffUserMock.mockResolvedValue(await fxB.staff("admin"));
    expect((await day(`date=${TUESDAY}`)).rooms).toEqual([]);
  });

  it("403 for an editor without labels", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("editor"));
    expect((await GET(jsonRequest("/api/v1/rooms", "GET"))).status).toBe(403);
  });
});
