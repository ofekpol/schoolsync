import { sql } from "drizzle-orm";
import { db } from "./client";

/** True when Postgres answers a trivial query. Used by /api/health for uptime checks. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
