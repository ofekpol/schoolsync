import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { testDb } from "./setup";

/** Gives the school an active academic year when it has none (boards need one). */
export async function ensureActiveYear(schoolId: string): Promise<void> {
  if (await getActiveAcademicYearId(schoolId)) return;
  const id = randomUUID();
  await testDb!.insert(schema.academicYears).values({
    id,
    schoolId,
    label: `tt-${id}`,
    startDate: "2026-09-01",
    endDate: "2027-06-30",
  });
  await testDb!.update(schema.schools).set({ activeAcademicYearId: id }).where(eq(schema.schools.id, schoolId));
}

/** A unique board name, so suites never clash on (school, name). */
export function boardName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
