import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { profileCategories, profileCategoryOptions, staffProfileOptions } from "@/lib/db/schema-profile";
import { roomWeeklySlots, rooms, roomsWeek } from "@/lib/db/schema-rooms";
import { DEFAULT_WEEK } from "@/lib/rooms/week-schema";

type Tx = NodePgDatabase<typeof schema>;

const ROOMS = ["מעבדת מדעים", "מעבדת מחשבים", "אולם ספורט", "ספרייה", "חדר אמנות", "חדר מוזיקה"];

/** [room index, day, period, label]: fixed weekly use, so the demo has occupied cells. */
const WEEKLY_USE: [number, number, number, string][] = [
  [0, 0, 1, "ז1 מדעים"],
  [0, 0, 2, "ז1 מדעים"],
  [0, 2, 3, "ח2 מדעים"],
  [1, 1, 4, "ט1 מחשבים"],
  [2, 1, 1, "י1 חינוך גופני"],
  [2, 3, 2, "ז2 חינוך גופני"],
  [4, 4, 5, "ח1 אמנות"],
];

const ROLE_CATEGORY = "תפקיד";
const ROLE_OPTIONS = [
  { label: "מורה", permissions: ["rooms.book" as const], sortOrder: 1 },
  { label: "מנהל/ת", permissions: ["rooms.manage" as const], sortOrder: 2 },
];

async function seedRoleCategory(tx: Tx, schoolId: string, viewerId: string): Promise<void> {
  await tx
    .insert(profileCategories)
    .values({ schoolId, name: ROLE_CATEGORY, multiSelect: true, adminAssigned: true, sortOrder: 99 })
    .onConflictDoNothing();
  const [category] = await tx
    .select({ id: profileCategories.id })
    .from(profileCategories)
    .where(and(eq(profileCategories.name, ROLE_CATEGORY), isNull(profileCategories.archivedAt)));
  await tx.update(profileCategories).set({ adminAssigned: true }).where(eq(profileCategories.id, category.id));
  for (const option of ROLE_OPTIONS) {
    const [existing] = await tx
      .select({ id: profileCategoryOptions.id })
      .from(profileCategoryOptions)
      .where(and(eq(profileCategoryOptions.categoryId, category.id), eq(profileCategoryOptions.label, option.label)));
    if (!existing) await tx.insert(profileCategoryOptions).values({ schoolId, categoryId: category.id, ...option });
  }
  const [teacher] = await tx
    .select({ id: profileCategoryOptions.id })
    .from(profileCategoryOptions)
    .where(and(eq(profileCategoryOptions.categoryId, category.id), eq(profileCategoryOptions.label, "מורה")));
  await tx.insert(staffProfileOptions).values({ staffUserId: viewerId, optionId: teacher.id, schoolId }).onConflictDoNothing();
}

/** Demo rooms inside `withSchool`: the week, six rooms, some fixed use, and the role labels. */
export async function seedRooms(tx: Tx, schoolId: string, yearId: string, adminId: string, viewerId: string): Promise<void> {
  await tx
    .insert(roomsWeek)
    .values({ schoolId, week: DEFAULT_WEEK })
    .onConflictDoNothing();
  for (const [index, name] of ROOMS.entries()) {
    await tx.insert(rooms).values({ schoolId, name, sortOrder: index + 1 }).onConflictDoNothing();
  }
  const roomRows = await tx.select({ id: rooms.id, name: rooms.name }).from(rooms).where(isNull(rooms.archivedAt));
  const roomId = (index: number) => roomRows.find((r) => r.name === ROOMS[index])?.id;
  for (const [index, day, period, label] of WEEKLY_USE) {
    const id = roomId(index);
    if (!id) continue;
    await tx
      .insert(roomWeeklySlots)
      .values({ schoolId, roomId: id, academicYearId: yearId, day, period, label, createdBy: adminId })
      .onConflictDoNothing();
  }
  await seedRoleCategory(tx, schoolId, viewerId);
}

/** Outside `withSchool` (the `schools` table is not readable there): turn rooms on and set the active year. */
export async function enableDemoRooms(database: Tx, schoolId: string, yearId: string): Promise<void> {
  await database
    .update(schema.schools)
    .set({
      services: sql`CASE WHEN 'rooms' = ANY(${schema.schools.services}) THEN ${schema.schools.services} ELSE ${schema.schools.services} || ARRAY['rooms'] END`,
      activeAcademicYearId: sql`coalesce(${schema.schools.activeAcademicYearId}, ${yearId}::uuid)`,
    })
    .where(eq(schema.schools.id, schoolId));
}
