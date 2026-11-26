import { z } from "zod";
import { PERMISSIONS, PermissionSchema } from "@/lib/permissions/catalog";

export const MAX_CATEGORIES = 30;
export const MAX_OPTIONS_PER_CATEGORY = 100;
export const MAX_LABEL_LENGTH = 60;

const label = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

/** Body of POST/PUT /api/v1/admin/categories. The order of `options` is their display order. */
const permissions = z
  .array(PermissionSchema)
  .max(PERMISSIONS.length * 2)
  .default([])
  .transform((list) => [...new Set(list)]);

export const CategoryInputSchema = z
  .object({
    name: label,
    multiSelect: z.boolean(),
    required: z.boolean(),
    adminAssigned: z.boolean().default(false),
    options: z
      .array(z.object({ id: z.string().uuid().optional(), label, permissions }))
      .max(MAX_OPTIONS_PER_CATEGORY)
      .refine((options) => new Set(options.map((o) => o.label)).size === options.length, {
        message: "duplicate_option",
      }),
  })
  .refine((c) => c.adminAssigned || c.options.every((o) => o.permissions.length === 0), {
    message: "permissions_need_admin_assigned",
    path: ["options"],
  });
/** Input shape: `adminAssigned` and option `permissions` may be omitted (they default to off). */
export type CategoryInput = z.input<typeof CategoryInputSchema>;

export const CategoryOrderSchema = z.object({
  ids: z.array(z.string().uuid()).max(MAX_CATEGORIES),
});

export const ProfileOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  sortOrder: z.number().int(),
  permissions: z.array(PermissionSchema),
});
export type ProfileOption = z.infer<typeof ProfileOptionSchema>;

export const ProfileCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  multiSelect: z.boolean(),
  required: z.boolean(),
  adminAssigned: z.boolean(),
  sortOrder: z.number().int(),
  options: z.array(ProfileOptionSchema),
});
export type ProfileCategory = z.infer<typeof ProfileCategorySchema>;

export const CategoriesResponseSchema = z.object({ categories: z.array(ProfileCategorySchema) });

/** Body of PUT /api/v1/profile and PUT /api/v1/admin/staff/[id]/labels. */
export const StaffOptionsSchema = z.object({
  optionIds: z.array(z.string().uuid()).max(MAX_CATEGORIES * MAX_OPTIONS_PER_CATEGORY),
});

export const ProfileResponseSchema = z.object({
  categories: z.array(ProfileCategorySchema),
  selected: z.array(z.string().uuid()),
});
