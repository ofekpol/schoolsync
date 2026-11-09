import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_CLEANUP_BATCH, cleanupExpiredDemos } from "@/lib/db/demo";

/** Upper bound per run so one invocation stays well inside the function timeout. */
const MAX_BATCHES = 10;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily Vercel cron (vercel.json): deletes expired demo schools and prunes the creation ledger. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const count = await cleanupExpiredDemos(DEMO_CLEANUP_BATCH);
    deleted += count;
    if (count < DEMO_CLEANUP_BATCH) break;
  }
  return NextResponse.json({ deleted }, { status: 200 });
}
