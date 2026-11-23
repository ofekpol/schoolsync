// Load .env.local first (Next.js convention), then fall back to .env
// Required because tsx/vitest scripts don't use Next.js env loading
import { config } from "dotenv";
config({ path: ".env.local", override: false, quiet: true });
config({ override: false, quiet: true });
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as baseSchema from "./schema";
import * as profileSchema from "./schema-profile";

const schema = { ...baseSchema, ...profileSchema };

/**
 * Lazy singleton DB pool and Drizzle client.
 * Defers DATABASE_URL check to first use so Next.js production builds
 * can collect page data for API routes without DATABASE_URL in the build env.
 */
let _db: NodePgDatabase<typeof schema> | null = null;

function getDb(): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL env var");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  _db = drizzle({ client: pool, schema });
  return _db;
}

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    return getDb()[prop as keyof NodePgDatabase<typeof schema>];
  },
});

export { supabaseAdmin } from "./supabase-admin";

type ErrorLike = {
  cause?: unknown;
  code?: unknown;
  hostname?: unknown;
};

function asErrorLike(error: unknown): ErrorLike | null {
  return error && typeof error === "object" ? (error as ErrorLike) : null;
}

/**
 * Drizzle wraps pg failures as "Failed query", which hides the useful network
 * or credential detail in Next's overlay. Keep the raw error as `cause`, but
 * promote actionable setup hints to the top-level message.
 */
export function rethrowWithDatabaseHint(error: unknown, context: string): never {
  const wrapped = asErrorLike(error);
  const cause = asErrorLike(wrapped?.cause) ?? wrapped;
  const code = typeof cause?.code === "string" ? cause.code : null;
  const hostname =
    typeof cause?.hostname === "string" ? cause.hostname : "the database host";

  let hint: string | null = null;
  if (code === "ENOTFOUND") {
    hint = `could not resolve ${hostname}. If this is a Supabase direct database host, it may be IPv6-only; use the Supabase pooler connection string in DATABASE_URL, or run from an IPv6-capable network. Also confirm the project ref is correct and the project is active.`;
  } else if (code === "ECONNREFUSED") {
    hint = `connection refused by ${hostname}. Check that the database is reachable and accepts direct connections.`;
  } else if (code === "ETIMEDOUT" || code === "ENETUNREACH") {
    hint = `could not reach ${hostname}. Check network access or use the Supabase pooler connection string in DATABASE_URL.`;
  } else if (code === "28P01") {
    hint = "database authentication failed. Check the username/password in DATABASE_URL.";
  } else if (code === "3D000") {
    hint = "database does not exist. Check the database name in DATABASE_URL.";
  }

  if (!hint) throw error;
  throw new Error(`${context}: ${hint}`, { cause: error });
}

/**
 * Run `fn` with `app.school_id` set to `schoolId` via SET LOCAL semantics.
 * Wraps a transaction so the setting is bound to that transaction (Pitfall 1: research).
 * All queries inside `fn` are subject to school_isolation RLS policy.
 *
 * Usage:
 *   const events = await withSchool(schoolId, (tx) =>
 *     tx.select().from(events).where(eq(events.status, "approved"))
 *   );
 */
export async function withSchool<T>(
  schoolId: string,
  fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL ROLE authenticated: switch to a role subject to RLS within this transaction.
    // The postgres user has bypassrls=true, so without this SET ROLE, RLS policies are skipped.
    // SET LOCAL reverts automatically when the transaction ends.
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    // set_config(name, value, is_local=TRUE) → SET LOCAL: scoped to this transaction.
    // Without the transaction wrapper this is a no-op (Pitfall 1).
    await tx.execute(sql`SELECT set_config('app.school_id', ${schoolId}, TRUE)`);
    return fn(tx as NodePgDatabase<typeof schema>);
  });
}
