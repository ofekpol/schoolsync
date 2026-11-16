import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db, withSchool } from "@/lib/db/client";
import { editorScopes, eventTypes, icalSubscriptions } from "@/lib/db/schema";
import { SCHOOL_GRADES } from "@/lib/grades";

export interface SubscriptionRow {
  id: string;
  token: string;
  filterGrades: number[];
  filterEventTypes: string[];
  createdAt: Date;
  revokedAt: Date | null;
}

export interface SubscriptionWithSchool {
  id: string;
  schoolId: string;
  staffUserId: string;
  filterGrades: number[];
  filterEventTypes: string[];
  revokedAt: Date | null;
}

export interface PersonalSubscriptionUser {
  id: string;
  schoolId: string | null;
  role: "editor" | "admin" | "viewer";
}

export interface PersonalSubscriptionFilters {
  grades: number[];
  eventTypes: string[];
}

export const NO_MATCHING_EVENT_TYPE_FILTER = "00000000-0000-0000-0000-000000000000";

/** 32 bytes base64url → 43 chars; well under the schema 64-char limit. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Creates an iCal subscription for the calling staff user, capturing the
 * current filter selection (grades + event-type ids). Returns the row id
 * and the freshly-minted token (the only time the token is returned in
 * cleartext — the UI shows it once, right after creation).
 */
export async function createSubscription(
  schoolId: string,
  staffUserId: string,
  filters: { grades: number[]; eventTypes: string[] },
): Promise<{ id: string; token: string }> {
  const token = generateToken();
  const [row] = await withSchool(schoolId, (tx) =>
    tx
      .insert(icalSubscriptions)
      .values({
        staffUserId,
        schoolId,
        token,
        filterGrades: filters.grades,
        filterEventTypes: filters.eventTypes,
      })
      .returning({ id: icalSubscriptions.id }),
  );
  return { id: row.id, token };
}

export async function buildPersonalSubscriptionFilters(
  user: PersonalSubscriptionUser,
): Promise<PersonalSubscriptionFilters> {
  if (!user.schoolId) return { grades: [], eventTypes: [] };
  if (user.role !== "editor") return { grades: [], eventTypes: [] };

  return withSchool(user.schoolId, async (tx) => {
    const gradeRows = await tx
      .select({ scopeValue: editorScopes.scopeValue })
      .from(editorScopes)
      .where(
        and(
          eq(editorScopes.staffUserId, user.id),
          eq(editorScopes.scopeKind, "grade"),
        ),
      );
    const grades =
      gradeRows.length > 0
        ? gradeRows.map((row) => Number(row.scopeValue)).sort((a, b) => a - b)
        : [...SCHOOL_GRADES];

    const typeScopeRows = await tx
      .select({ scopeValue: editorScopes.scopeValue })
      .from(editorScopes)
      .where(
        and(
          eq(editorScopes.staffUserId, user.id),
          eq(editorScopes.scopeKind, "event_type"),
        ),
      );
    if (typeScopeRows.length === 0) return { grades, eventTypes: [] };

    const scopedKeys = new Set(typeScopeRows.map((row) => row.scopeValue));
    const typeRows = await tx
      .select({ id: eventTypes.id, key: eventTypes.key })
      .from(eventTypes);
    const filteredTypeIds = typeRows
      .filter((row) => scopedKeys.has(row.key))
      .map((row) => row.id)
      .sort();

    return {
      grades,
      eventTypes:
        filteredTypeIds.length > 0 ? filteredTypeIds : [NO_MATCHING_EVENT_TYPE_FILTER],
    };
  });
}

export async function createPersonalCalendarSubscription(
  user: PersonalSubscriptionUser,
): Promise<{ id: string; token: string }> {
  if (!user.schoolId) throw new Error("missing_school");
  const filters = await buildPersonalSubscriptionFilters(user);
  return createSubscription(user.schoolId, user.id, filters);
}

/**
 * Lists the calling staff user's subscriptions, newest-first. Both active
 * and revoked rows are returned so the UI can show history and filter to
 * active locally.
 */
export async function listSubscriptionsForStaff(
  schoolId: string,
  staffUserId: string,
): Promise<SubscriptionRow[]> {
  return withSchool(schoolId, (tx) =>
    tx
      .select({
        id: icalSubscriptions.id,
        token: icalSubscriptions.token,
        filterGrades: icalSubscriptions.filterGrades,
        filterEventTypes: icalSubscriptions.filterEventTypes,
        createdAt: icalSubscriptions.createdAt,
        revokedAt: icalSubscriptions.revokedAt,
      })
      .from(icalSubscriptions)
      .where(eq(icalSubscriptions.staffUserId, staffUserId))
      .orderBy(desc(icalSubscriptions.createdAt), asc(icalSubscriptions.id)),
  );
}

/**
 * Soft-revokes a subscription by setting `revoked_at = now()`. Public
 * /ical/[token] route checks this column on every request, so a revoked
 * subscription is invisible to the next refresh (cache-controlled at 60 s
 * upstream → revocation visible within ~1 min).
 *
 * Returns true iff the row was found, owned by the caller, and not yet
 * revoked. False otherwise (so the route returns 404 without leaking
 * "wrong caller" vs "already revoked").
 */
export async function revokeSubscription(
  schoolId: string,
  staffUserId: string,
  subscriptionId: string,
): Promise<boolean> {
  const ok = await withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .select({
        id: icalSubscriptions.id,
        staffUserId: icalSubscriptions.staffUserId,
        revokedAt: icalSubscriptions.revokedAt,
      })
      .from(icalSubscriptions)
      .where(eq(icalSubscriptions.id, subscriptionId))
      .limit(1);
    if (!row) return false;
    if (row.staffUserId !== staffUserId) return false;
    if (row.revokedAt !== null) return false;

    await tx
      .update(icalSubscriptions)
      .set({ revokedAt: new Date() })
      .where(eq(icalSubscriptions.id, subscriptionId));
    return true;
  });
  return ok;
}

/**
 * Resolves a token to its owning school + staff + filters in one lookup.
 * Used by the public /ical/[token] route: we don't know the schoolId yet,
 * so we use `db` (unrestricted) — guarded by the token's secrecy. Revoked
 * rows return null so the public route 404s.
 *
 * Lives in lib/ical/ (not lib/db/) because the only sensitive operation
 * is reading the ical_subscriptions row itself, which is keyed on a
 * cryptographic token. The query never touches another tenant's data.
 */
export async function getSubscriptionByToken(
  token: string,
): Promise<SubscriptionWithSchool | null> {
  const [row] = await db
    .select({
      id: icalSubscriptions.id,
      schoolId: icalSubscriptions.schoolId,
      staffUserId: icalSubscriptions.staffUserId,
      filterGrades: icalSubscriptions.filterGrades,
      filterEventTypes: icalSubscriptions.filterEventTypes,
      revokedAt: icalSubscriptions.revokedAt,
    })
    .from(icalSubscriptions)
    .where(and(eq(icalSubscriptions.token, token), isNull(icalSubscriptions.revokedAt)))
    .limit(1);
  return row ?? null;
}
