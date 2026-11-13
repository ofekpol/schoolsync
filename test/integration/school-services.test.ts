import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getSchoolById } from "@/lib/db/schools";
import { skipIfNoTestDb, testDb, testSchoolA } from "./setup";

describe.skipIf(skipIfNoTestDb)("schools.services", () => {
  afterAll(async () => {
    await testDb?.execute(sql`UPDATE schools SET services = '{gantt}' WHERE id = ${testSchoolA}`);
  });

  it("defaults an existing school to gantt only", async () => {
    const school = await getSchoolById(testSchoolA);
    expect(school?.services).toEqual(["gantt"]);
  });

  it("rejects an empty list and unknown services", async () => {
    const setServices = (value: string) =>
      testDb!.execute(sql`UPDATE schools SET services = ${value}::text[] WHERE id = ${testSchoolA}`);
    await expect(setServices("{}")).rejects.toThrow();
    await expect(setServices("{rooms}")).rejects.toThrow();
  });
});
