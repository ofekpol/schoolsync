import { NextResponse } from "next/server";

/**
 * Converts a `Response` thrown by an access guard (assertAdmin,
 * assertCanCreateEventType, requirePlatformAdmin) into the JSON the routes
 * return: `{ error: "Forbidden" }` with the guard's 401/403 status.
 * Anything else is rethrown.
 */
export function guardFailureResponse(e: unknown): NextResponse {
  if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
  throw e;
}

/**
 * Converts a `Response` thrown by domain code (e.g. publishEvent's 404) into
 * `{ error: statusText }` with its status. Anything else is rethrown.
 */
export function thrownResponseToJson(e: unknown): NextResponse {
  if (e instanceof Response) {
    return NextResponse.json({ error: e.statusText || "Error" }, { status: e.status });
  }
  throw e;
}
