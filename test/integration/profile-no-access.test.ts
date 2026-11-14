import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";
import { profileCategories } from "@/lib/db/schema-profile";
import { createCategory } from "@/lib/profile/categories";
import { setStaffOptions } from "@/lib/profile/staff-labels";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA } from "./setup";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

import { POST } from "@/app/api/v1/events/route";

/**
 * Labels describe people and never grant access: an editor scoped to grade 7
 * who holds every label of the school still cannot create a grade 8 event.
 */
describe.skipIf(skipIfNoTestDb)("profile labels grant no access", () => {
  const editorId = randomUUID();
  let eventTypeId: string;
  const categoryIds: string[] = [];

  function createEvent(grades: number[]) {
    return POST(
      new NextRequest("http://localhost/api/v1/events", {
        method: "POST",
        body: JSON.stringify({ eventTypeId, grades }),
        headers: { "content-type": "application/json" },
      }),
    );
  }

  beforeAll(async () => {
    if (shouldSkip()) return;
    await testDb!.insert(schema.staffUsers).values({
      id: editorId,
      schoolId: testSchoolA,
      email: `no-access-${editorId}@test`,
      fullName: "Labelled Editor",
      role: "editor",
      status: "active",
    });
    await testDb!.insert(schema.editorScopes).values({
      staffUserId: editorId,
      schoolId: testSchoolA,
      scopeKind: "grade",
      scopeValue: "7",
    });
    const [type] = await testDb!
      .select({ id: schema.eventTypes.id })
      .from(schema.eventTypes)
      .where(eq(schema.eventTypes.schoolId, testSchoolA))
      .limit(1);
    eventTypeId = type.id;

    const tag = randomUUID().slice(0, 8);
    const grade = await createCategory(testSchoolA, {
      name: `שכבה ${tag}`,
      multiSelect: true,
      required: false,
      options: [7, 8, 9, 10, 11, 12].map((g) => ({ label: `שכבה ${g}` })),
    });
    const role = await createCategory(testSchoolA, {
      name: `תפקיד ${tag}`,
      multiSelect: true,
      required: false,
      options: [{ label: "מנהל" }, { label: "admin" }, { label: "רכז שכבה ח" }],
    });
    categoryIds.push(grade.id, role.id);
    await setStaffOptions(
      testSchoolA,
      editorId,
      [...grade.options, ...role.options].map((option) => option.id),
    );
    getStaffUserMock.mockResolvedValue({
      id: editorId,
      schoolId: testSchoolA,
      role: "editor",
      status: "active",
      email: `no-access-${editorId}@test`,
      fullName: "Labelled Editor",
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await testDb!.delete(schema.events).where(eq(schema.events.createdBy, editorId));
    await testDb!.delete(profileCategories).where(inArray(profileCategories.id, categoryIds));
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, editorId));
  });

  it("still rejects a grade outside the editor's scope", async () => {
    const res = await createEvent([8]);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "scope_violation", grades: [8] });
  });

  it("still allows the grade inside the editor's scope", async () => {
    const res = await createEvent([7]);
    expect(res.status).toBe(201);
  });
});
