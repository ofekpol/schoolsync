import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roomBookings, roomWeeklySlots } from "@/lib/db/schema-rooms";
import { listRooms } from "@/lib/rooms/rooms";
import { RoomsFixture, jsonRequest } from "./rooms-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

import { POST } from "@/app/api/v1/rooms/route";
import { DELETE, PATCH } from "@/app/api/v1/rooms/[id]/route";
import { PUT as ORDER } from "@/app/api/v1/rooms/order/route";

const fx = new RoomsFixture(testSchoolA);
const fxB = new RoomsFixture(testSchoolB);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(name: string) {
  return POST(jsonRequest("/api/v1/rooms", "POST", { name }));
}

describe.skipIf(skipIfNoTestDb)("rooms CRUD", () => {
  beforeEach(async () => {
    if (shouldSkip()) return;
    await fx.cleanup();
    await fxB.cleanup();
    await fx.enableRooms();
    getStaffUserMock.mockReset();
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.manage"]));
  });
  afterAll(async () => {
    if (shouldSkip()) return;
    await fx.cleanup();
    await fxB.cleanup();
  });

  it("creates a room; the same name again is 409 duplicate_name, also with surrounding spaces", async () => {
    const res = await create("מעבדה 1");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "מעבדה 1" });
    const again = await create("  מעבדה 1 ");
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "duplicate_name" });
  });

  it("needs rooms.manage to create", async () => {
    getStaffUserMock.mockResolvedValue(await fx.staff("viewer", ["rooms.book"]));
    expect((await create("חדר")).status).toBe(403);
  });

  it("rejects an empty or over-long name", async () => {
    expect((await create("   ")).status).toBe(400);
    expect((await create("x".repeat(61))).status).toBe(400);
  });

  it("renames, and renaming to a taken name is 409", async () => {
    const a = (await (await create("א")).json()) as { id: string };
    await create("ב");
    const renamed = await PATCH(jsonRequest(`/api/v1/rooms/${a.id}`, "PATCH", { name: "ג" }), ctx(a.id));
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ id: a.id, name: "ג" });
    const taken = await PATCH(jsonRequest(`/api/v1/rooms/${a.id}`, "PATCH", { name: "ב" }), ctx(a.id));
    expect(taken.status).toBe(409);
  });

  it("reorders rooms", async () => {
    const a = (await (await create("א")).json()) as { id: string };
    const b = (await (await create("ב")).json()) as { id: string };
    expect((await ORDER(jsonRequest("/api/v1/rooms/order", "PUT", { ids: [b.id, a.id] }))).status).toBe(204);
    expect((await listRooms(testSchoolA)).map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("refuses archiving a room with a weekly slot in the active year or a future booking", async () => {
    const staff = await fx.staff("admin");
    const yearId = await fx.activeYear();
    const room = (await (await create("מעבדה")).json()) as { id: string };
    await testDb!.insert(roomWeeklySlots).values({
      schoolId: testSchoolA, roomId: room.id, academicYearId: yearId, day: 0, period: 1, label: "ז1", createdBy: staff.id,
    });
    const blocked = await DELETE(jsonRequest(`/api/v1/rooms/${room.id}`, "DELETE"), ctx(room.id));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: "room_in_use" });

    const other = (await (await create("אולם")).json()) as { id: string };
    await testDb!.insert(roomBookings).values({
      schoolId: testSchoolA, roomId: other.id, groupId: randomUUID(), date: "2099-01-04", period: 1, staffUserId: staff.id,
    });
    expect((await DELETE(jsonRequest(`/api/v1/rooms/${other.id}`, "DELETE"), ctx(other.id))).status).toBe(409);
  });

  it("archives an unused room and frees its name", async () => {
    const room = (await (await create("מחסן")).json()) as { id: string };
    expect((await DELETE(jsonRequest(`/api/v1/rooms/${room.id}`, "DELETE"), ctx(room.id))).status).toBe(204);
    expect((await listRooms(testSchoolA)).map((r) => r.id)).not.toContain(room.id);
    expect((await create("מחסן")).status).toBe(201);
  });

  it("404 for an unknown id or another school's room", async () => {
    const unknown = randomUUID();
    expect((await PATCH(jsonRequest(`/api/v1/rooms/${unknown}`, "PATCH", { name: "x" }), ctx(unknown))).status).toBe(404);
    const foreign = await fxB.room("זר");
    expect((await PATCH(jsonRequest(`/api/v1/rooms/${foreign}`, "PATCH", { name: "x" }), ctx(foreign))).status).toBe(404);
    expect((await DELETE(jsonRequest(`/api/v1/rooms/${foreign}`, "DELETE"), ctx(foreign))).status).toBe(404);
  });
});
