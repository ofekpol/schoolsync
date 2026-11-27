import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { CategoryInputSchema } from "@/lib/validations/profile";

const base = { name: "תפקיד", multiSelect: false, required: false };

describe("CategoryInputSchema permissions", () => {
  it("rejects permissions on a category that is not admin-assigned", () => {
    const result = CategoryInputSchema.safeParse({
      ...base,
      adminAssigned: false,
      options: [{ label: "מורה", permissions: ["rooms.book"] }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("permissions_need_admin_assigned");
  });

  it("rejects an unknown permission", () => {
    const result = CategoryInputSchema.safeParse({
      ...base,
      adminAssigned: true,
      options: [{ label: "מורה", permissions: ["rooms.fly"] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts known permissions on an admin-assigned category and dedupes them", () => {
    const result = CategoryInputSchema.parse({
      ...base,
      adminAssigned: true,
      options: [{ label: "מנהל/ת", permissions: ["rooms.book", "rooms.manage", "rooms.book"] }],
    });
    expect(result.options[0].permissions).toEqual(["rooms.book", "rooms.manage"]);
  });

  it("defaults adminAssigned and permissions for older clients", () => {
    const result = CategoryInputSchema.parse({ ...base, options: [{ label: "מורה" }] });
    expect(result.adminAssigned).toBe(false);
    expect(result.options[0].permissions).toEqual([]);
  });
});

describe("permission catalog", () => {
  it("matches the CHECK in migration 0029", () => {
    const sql = readFileSync(join(process.cwd(), "db/migrations/0029_profile_permissions.sql"), "utf8");
    const listed = /ARRAY\[([^\]]+)\]/.exec(sql)![1].match(/'([^']+)'/g)!.map((v) => v.slice(1, -1));
    expect(listed).toEqual([...PERMISSIONS]);
  });
});
