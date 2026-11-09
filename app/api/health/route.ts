import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db/health";

export const dynamic = "force-dynamic";

/** Uptime probe (.github/workflows/uptime.yml): 200 when the app and its database answer. */
export async function GET(): Promise<NextResponse> {
  const database = await pingDatabase();
  return NextResponse.json(
    { ok: database, database },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
