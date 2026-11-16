import { describe, expect, it } from "vitest";
import { guardFailureResponse, thrownResponseToJson } from "@/lib/auth/thrown-response";

describe("guardFailureResponse", () => {
  it("answers a thrown 403 with Forbidden and the same status", async () => {
    const res = guardFailureResponse(new Response("Forbidden", { status: 403 }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("keeps a thrown 401 status (body still says Forbidden, as before)", async () => {
    const res = guardFailureResponse(new Response("Unauthorized", { status: 401 }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("rethrows anything that is not a Response", () => {
    const err = new Error("db down");
    expect(() => guardFailureResponse(err)).toThrow(err);
  });
});

describe("thrownResponseToJson", () => {
  it("uses the thrown status text and status", async () => {
    const res = thrownResponseToJson(
      new Response(null, { status: 404, statusText: "Not found or not publishable" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Not found or not publishable" });
  });

  it("falls back to Error when there is no status text", async () => {
    const res = thrownResponseToJson(new Response(null, { status: 409 }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Error" });
  });

  it("rethrows anything that is not a Response", () => {
    const err = new Error("boom");
    expect(() => thrownResponseToJson(err)).toThrow(err);
  });
});
