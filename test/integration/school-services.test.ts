import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getActiveAcademicYearId, getSchoolById, updateSchoolServices } from "@/lib/db/schools";
import { skipIfNoTestDb, testDb, testSchoolA } from "./setup";

const ACTOR = "00000000-0000-0000-0000-0000000000ad";

describe.skipIf(skipIfNoTestDb)("schools.services", () => {
  afterAll(async () => {
    await testDb?.execute(sql`UPDATE schools SET services = '{gantt}' WHERE id = ${testSchoolA}`);
    await testDb?.execute(
      sql`DELETE FROM audit_log WHERE school_id = ${testSchoolA} AND action = 'school_services_updated'`,
    );
  });

  it("defaults an existing school to gantt only", async () => {
    const school = await getSchoolById(testSchoolA);
    expect(school?.services).toEqual(["gantt"]);
  });

  it("rejects an empty list and unknown services", async () => {
    const setServices = (value: string) =>
      testDb!.execute(sql`UPDATE schools SET services = ${value}::text[] WHERE id = ${testSchoolA}`);
    await expect(setServices("{}")).rejects.toThrow();
    await expect(setServices("{chess}")).rejects.toThrow();
  });

  it("accepts rooms (migration 0030) and gives the school an active year for it", async () => {
    await testDb!.execute(sql`UPDATE schools SET active_academic_year_id = NULL WHERE id = ${testSchoolA}`);
    expect(await updateSchoolServices(testSchoolA, ["gantt", "rooms"], ACTOR)).toBe(true);
    expect((await getSchoolById(testSchoolA))?.services).toEqual(["gantt", "rooms"]);
    const yearId = await getActiveAcademicYearId(testSchoolA);
    expect(yearId).not.toBeNull();
    // Turning rooms on again keeps the same year.
    await updateSchoolServices(testSchoolA, ["gantt", "rooms"], ACTOR);
    expect(await getActiveAcademicYearId(testSchoolA)).toBe(yearId);
    await testDb!.execute(sql`UPDATE schools SET services = '{gantt}', active_academic_year_id = NULL WHERE id = ${testSchoolA}`);
    await testDb!.execute(sql`DELETE FROM academic_years WHERE id = ${yearId}`);
  });

  it("updates a school's services and reports unknown schools", async () => {
    expect(await updateSchoolServices(testSchoolA, ["gantt"], ACTOR)).toBe(true);
    expect((await getSchoolById(testSchoolA))?.services).toEqual(["gantt"]);
    expect(await updateSchoolServices("00000000-0000-0000-0000-00000000dead", ["gantt"], ACTOR)).toBe(false);
  });

  it("records the change in the school's audit log", async () => {
    const result = await testDb!.execute(
      sql`SELECT payload FROM audit_log WHERE school_id = ${testSchoolA} AND action = 'school_services_updated' AND payload->>'actorAuthId' = ${ACTOR} ORDER BY at DESC LIMIT 1`,
    );
    expect(result.rows[0]?.payload).toEqual({ from: ["gantt"], to: ["gantt"], actorAuthId: ACTOR });
  });
});
