import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/lib/auth/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdminMock(...args),
}));

const provisionSchoolMock = vi.fn();
vi.mock("@/lib/db/provision", () => ({
  provisionSchool: (...args: unknown[]) => provisionSchoolMock(...args),
}));

const listAllSchoolsMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  listAllSchools: (...args: unknown[]) => listAllSchoolsMock(...args),
}));

import { GET, POST } from "@/app/api/v1/platform/schools/route";

const VALID_BODY = {
  slug: "new-school",
  name: "New School",
  locale: "he",
  adminEmail: "admin@new-school.test",
  adminName: "New Admin",
};

const PROVISIONED = {
  schoolId: "00000000-0000-0000-0000-0000000000c1",
  adminAuthUserId: "00000000-0000-0000-0000-0000000000c2",
  magicLinkUrl: "https://example.test/magic",
  magicLinkExpiresAt: "2026-10-26T12:00:00.000Z",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/platform/schools", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/v1/platform/schools", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    requirePlatformAdminMock.mockReset();
    requirePlatformAdminMock.mockResolvedValue({ id: "platform-admin" });
    provisionSchoolMock.mockReset();
    listAllSchoolsMock.mockReset();
  });

  it("returns 401 when signed out and 403 for non-platform-admins, without provisioning", async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    expect((await POST(makeRequest(VALID_BODY))).status).toBe(401);
    requirePlatformAdminMock.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await POST(makeRequest(VALID_BODY))).status).toBe(403);
    requirePlatformAdminMock.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await GET()).status).toBe(403);
    expect(provisionSchoolMock).not.toHaveBeenCalled();
  });

  it("lists schools for a platform admin", async () => {
    listAllSchoolsMock.mockResolvedValue([{ id: "s1", slug: "a", name: "A" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).schools).toHaveLength(1);
  });

  it("rejects invalid input with 400", async () => {
    expect((await POST(makeRequest({ ...VALID_BODY, adminEmail: "nope" }))).status).toBe(400);
    expect((await POST(makeRequest({ ...VALID_BODY, slug: "Bad Slug" }))).status).toBe(400);
    expect(provisionSchoolMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown service with 400", async () => {
    expect((await POST(makeRequest({ ...VALID_BODY, services: ["rooms"] }))).status).toBe(400);
    expect(provisionSchoolMock).not.toHaveBeenCalled();
  });

  it("passes the chosen services to provisionSchool", async () => {
    provisionSchoolMock.mockResolvedValue(PROVISIONED);
    await POST(makeRequest({ ...VALID_BODY, services: ["timetable"] }));
    expect(provisionSchoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ services: ["timetable"] }),
      expect.anything(),
    );
  });

  it("returns 409 when the slug is taken", async () => {
    provisionSchoolMock.mockRejectedValue(
      new Error('school with slug "new-school" already exists — refusing to clobber'),
    );
    expect((await POST(makeRequest(VALID_BODY))).status).toBe(409);
  });

  it("provisions the school and returns the admin's magic link", async () => {
    provisionSchoolMock.mockResolvedValue(PROVISIONED);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      schoolId: PROVISIONED.schoolId,
      slug: "new-school",
      magicLinkUrl: PROVISIONED.magicLinkUrl,
    });
  });

  it("falls back to the request origin for the magic link when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    provisionSchoolMock.mockResolvedValue(PROVISIONED);
    await POST(makeRequest(VALID_BODY));
    expect(provisionSchoolMock).toHaveBeenCalledWith(expect.anything(), "http://localhost");
  });
});
