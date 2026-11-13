import { z } from "zod";
import { ServicesSchema } from "@/lib/services";

/** URL slug of a school (tenant): an internal, guessable name — never an access key. */
export const SchoolSlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "slug must match ^[a-z0-9-]+$");

/**
 * Secret per-school link token (`schools.access_token`): keys `/<token>` public
 * views and `?school=<token>` sign-up links. Slugs are guessable, so they never are.
 */
export const SchoolAccessTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** New tenant: `provisionSchool()` input, shared by the CLI and /api/v1/platform/schools. */
export const ProvisionSchoolInput = z.object({
  slug: SchoolSlugSchema,
  name: z.string().min(1).max(200),
  locale: z.enum(["he", "en"]).default("he"),
  timezone: z.string().default("Asia/Jerusalem"),
  adminEmail: z.string().email().max(255),
  adminName: z.string().min(1).max(200),
  services: ServicesSchema.default(["gantt"]),
});

export type ProvisionSchoolInput = z.infer<typeof ProvisionSchoolInput>;
