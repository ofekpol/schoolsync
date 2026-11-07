import "dotenv/config";
import { parseArgs } from "node:util";
import {
  provisionSchool,
  type ProvisionSchoolInput,
  type ProvisionSchoolResult,
} from "@/lib/db/provision";

/**
 * CLI to provision a new school (tenant) + admin user.
 *
 * Usage:
 *   pnpm provision:school \
 *     --slug=kfar-galim \
 *     --name="כפר גלים" \
 *     --admin-email=admin@example.com \
 *     --admin-name="ישראל ישראלי"
 *
 * Optional:
 *   --locale=he|en        (default he)
 *   --timezone=...        (default Asia/Jerusalem)
 *
 * Prints the admin's one-time magic link; deliver it to them by hand.
 */

const REQUIRED_FLAGS = [
  "slug",
  "name",
  "admin-email",
  "admin-name",
] as const;

function parseFlags(): ProvisionSchoolInput {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      locale: { type: "string" },
      timezone: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
    },
    strict: true,
  });

  const missing = REQUIRED_FLAGS.filter((k) => !values[k]);
  if (missing.length > 0) {
    console.error(`Missing required flags: ${missing.map((k) => `--${k}`).join(", ")}`);
    process.exit(1);
  }

  const locale = values.locale === "en" ? "en" : "he";
  return {
    slug: values.slug!,
    name: values.name!,
    locale,
    timezone: values.timezone ?? "Asia/Jerusalem",
    adminEmail: values["admin-email"]!,
    adminName: values["admin-name"]!,
  };
}

function reportResult(input: ProvisionSchoolInput, result: ProvisionSchoolResult): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "(NEXT_PUBLIC_APP_URL unset)";
  console.log("");
  console.log("School provisioned successfully:");
  console.log(`  schoolId         = ${result.schoolId}`);
  console.log(`  staff sign-up    = ${appUrl}/auth/login?school=${result.accessToken}`);
  console.log(`  guest view       = ${appUrl}/schedule?school=${result.accessToken}`);
  console.log(`  admin email      = ${input.adminEmail}`);
  console.log(`  admin authId     = ${result.adminAuthUserId}`);
  console.log(`  magic link       = ${result.magicLinkUrl}`);
  console.log(`  magic link until = ${result.magicLinkExpiresAt}`);
  console.log("");
  console.log("Deliver the magic link to the admin by hand.");
}

async function main(): Promise<void> {
  const input = parseFlags();
  const result = await provisionSchool(input);
  reportResult(input, result);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
