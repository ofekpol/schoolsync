import { z } from "zod";

export const MAX_CATEGORIES = 30;
export const MAX_OPTIONS_PER_CATEGORY = 100;
export const MAX_LABEL_LENGTH = 60;

const label = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

/** Body of POST/PUT /api/v1/admin/categories. The order of `options` is their display order. */
export const CategoryInputSchema = z.object({
  name: label,
  multiSelect: z.boolean(),
  required: z.boolean(),
  options: z
    .array(z.object({ id: z.string().uuid().optional(), label }))
    .max(MAX_OPTIONS_PER_CATEGORY)
    .refine((options) => new Set(options.map((o) => o.label)).size === options.length, {
      message: "duplicate_option",
    }),
});
export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export const CategoryOrderSchema = z.object({
  ids: z.array(z.string().uuid()).max(MAX_CATEGORIES),
});

export const ProfileOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  sortOrder: z.number().int(),
});
export type ProfileOption = z.infer<typeof ProfileOptionSchema>;

export const ProfileCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  multiSelect: z.boolean(),
  required: z.boolean(),
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
