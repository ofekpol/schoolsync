import { describe, it, expect, vi } from "vitest";

const pingMock = vi.fn();
vi.mock("@/lib/db/health", () => ({ pingDatabase: () => pingMock() }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("is 200 when the database answers", async () => {
    pingMock.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is 503 when the database is down", async () => {
    pingMock.mockResolvedValue(false);
    expect((await GET()).status).toBe(503);
  });
});
