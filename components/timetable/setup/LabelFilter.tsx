import type { ProfileCategory } from "@/lib/validations/profile";

interface Props {
  categories: ProfileCategory[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  allLabel: string;
}

/** A select of profile options grouped by category; "all" = no filter. Hidden when there are no categories. */
export function LabelFilter({ categories, value, onChange, label, allLabel }: Props) {
  if (categories.length === 0) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      className="h-9 rounded-lg border border-neutral-300 px-2 text-sm">
      <option value="all">{allLabel}</option>
      {categories.map((category) => (
        <optgroup key={category.id} label={category.name}>
          {category.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
