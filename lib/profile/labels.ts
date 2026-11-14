import type { ProfileCategory } from "@/lib/validations/profile";

/** Staff-table label filter: everyone, one option id, or "missing a required label". */
export type LabelFilter = "all" | "missing" | (string & {});

/** The labels a staff member holds, in category then option order. Unknown ids are dropped. */
export function labelNames(categories: ProfileCategory[], optionIds: string[]): string[] {
  const held = new Set(optionIds);
  return categories.flatMap((category) =>
    category.options.filter((option) => held.has(option.id)).map((option) => option.label),
  );
}

/** True when a required category that has options holds none of the staff member's labels. */
export function missesRequired(categories: ProfileCategory[], optionIds: string[]): boolean {
  const held = new Set(optionIds);
  return categories.some(
    (category) =>
      category.required &&
      category.options.length > 0 &&
      !category.options.some((option) => held.has(option.id)),
  );
}

export function matchesLabelFilter(
  filter: LabelFilter,
  categories: ProfileCategory[],
  optionIds: string[],
): boolean {
  if (filter === "all") return true;
  if (filter === "missing") return missesRequired(categories, optionIds);
  return optionIds.includes(filter);
}
