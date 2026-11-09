import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPublicViewerEventSignatureMock = vi.fn();
vi.mock("@/lib/views/public-viewer-data", () => ({
  loadPublicViewerEventSignature: (...args: unknown[]) =>
    loadPublicViewerEventSignatureMock(...args),
}));

import { GET } from "@/app/api/v1/public/[school]/events/signature/route";

describe("GET /api/v1/public/[school]/events/signature", () => {
  beforeEach(() => {
    loadPublicViewerEventSignatureMock.mockReset();
  });

  it("returns a lightweight signature with short public cache headers", async () => {
    loadPublicViewerEventSignatureMock.mockResolvedValue("12:42:2031-02-03T07:00:00.000Z");

    const res = await GET(new Request("http://localhost/api/v1/public/school-a/events/signature"), {
      params: Promise.resolve({ school: "school-a" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=5");
    await expect(res.json()).resolves.toEqual({
      signature: "12:42:2031-02-03T07:00:00.000Z",
    });
  });

  it("returns 404 when the school does not exist", async () => {
    loadPublicViewerEventSignatureMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/public/missing/events/signature"), {
      params: Promise.resolve({ school: "missing" }),
    });

    expect(res.status).toBe(404);
  });
});
