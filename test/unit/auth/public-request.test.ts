import { describe, expect, it } from "vitest";
import { shouldBypassAuthRefresh } from "@/lib/auth/public-request";

describe("shouldBypassAuthRefresh", () => {
  it("bypasses middleware auth refresh for public viewer paths", () => {
    expect(shouldBypassAuthRefresh("/demo-school/calendar")).toBe(true);
  });

  it("keeps the root and staff routes behind middleware authentication", () => {
    expect(shouldBypassAuthRefresh("/")).toBe(false);
    expect(shouldBypassAuthRefresh("/dashboard")).toBe(false);
    expect(shouldBypassAuthRefresh("/platform")).toBe(false);
    expect(shouldBypassAuthRefresh("/platform/schools")).toBe(false);
    expect(shouldBypassAuthRefresh("/support")).toBe(false);
  });

  it("bypasses middleware auth refresh for the read-only public schedule", () => {
    expect(shouldBypassAuthRefresh("/schedule")).toBe(true);
    expect(shouldBypassAuthRefresh("/schedule/")).toBe(true);
    expect(shouldBypassAuthRefresh("/schedule/anything")).toBe(false);
  });

  it("bypasses middleware auth refresh for the legal pages", () => {
    expect(shouldBypassAuthRefresh("/accessibility")).toBe(true);
    expect(shouldBypassAuthRefresh("/privacy")).toBe(true);
  });

  it("lets the uptime probe through without a session", () => {
    expect(shouldBypassAuthRefresh("/api/health")).toBe(true);
  });
});
