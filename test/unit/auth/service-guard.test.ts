import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffUserRecord } from "@/lib/auth/session";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const getSchoolByIdMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  getSchoolById: (...args: unknown[]) => getSchoolByIdMock(...args),
}));

import { requireService, serviceDisabledResponse } from "@/lib/auth/service-guard";

const user = { id: "u1", schoolId: "s1" } as StaffUserRecord;

describe("requireService", () => {
  beforeEach(() => getSchoolByIdMock.mockReset());

  it("passes when the school has the service", async () => {
    getSchoolByIdMock.mockResolvedValue({ services: ["gantt"] });
    await expect(requireService(user, "gantt")).resolves.toBeUndefined();
    expect(getSchoolByIdMock).toHaveBeenCalledWith("s1");
  });

  it("redirects a timetable-only school away from the Gantt to /timetable", async () => {
    getSchoolByIdMock.mockResolvedValue({ services: ["timetable"] });
    await expect(requireService(user, "gantt")).rejects.toThrow("REDIRECT /timetable");
  });

  it("redirects a gantt-only school away from the timeTable to /dashboard", async () => {
    getSchoolByIdMock.mockResolvedValue({ services: ["gantt"] });
    await expect(requireService(user, "timetable")).rejects.toThrow("REDIRECT /dashboard");
  });

  it("is not-found instead of redirecting to the home of the service it requires", async () => {
    getSchoolByIdMock.mockResolvedValue({ services: [] });
    await expect(requireService(user, "timetable")).rejects.toThrow("NOT_FOUND");
  });

  it("is not-found when the user has no school or the school is missing", async () => {
    await expect(requireService({ ...user, schoolId: null } as StaffUserRecord, "gantt")).rejects.toThrow("NOT_FOUND");
    getSchoolByIdMock.mockResolvedValue(null);
    await expect(requireService(user, "gantt")).rejects.toThrow("NOT_FOUND");
  });
});

describe("serviceDisabledResponse", () => {
  beforeEach(() => getSchoolByIdMock.mockReset());

  it("allows a school that has the service", async () => {
    getSchoolByIdMock.mockResolvedValue({ services: ["gantt", "timetable"] });
    expect(await serviceDisabledResponse("s1", "gantt")).toBeNull();
  });

  it("returns 403 service_disabled when the school lacks the service", async () => {
    getSchoolByIdMock.mockResolvedValue({ services: ["timetable"] });
    const res = await serviceDisabledResponse("s1", "gantt");
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "service_disabled" });
  });

  it("returns 403 when the school row is missing", async () => {
    getSchoolByIdMock.mockResolvedValue(null);
    expect((await serviceDisabledResponse("s1", "gantt"))?.status).toBe(403);
  });

  it("leaves a request without a school to the route's own auth check", async () => {
    expect(await serviceDisabledResponse(null, "gantt")).toBeNull();
    expect(getSchoolByIdMock).not.toHaveBeenCalled();
  });
});
