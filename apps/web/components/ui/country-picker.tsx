"use client";

import { COUNTRIES } from "@/lib/countries";

interface Props {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  /** Optional aria-label / wrapper-less use. */
  label?: string;
}

/**
 * Plain native `<select>` of ISO country codes — keeps "Česko"/CZ
 * consistent across profile, billing, future fields. Native picker
 * works fine on mobile and doesn't need a custom dropdown library.
 *
 * Always renders a "— neuvedeno —" empty option as the first item so
 * the field can be cleared. The backend stores the empty value as ""
 * which keeps the form-completion check honest.
 */
export function CountryPicker({ id, value, onChange }: Props) {
  return (
    <select
      id={id}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
    >
      <option value="">— neuvedeno —</option>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} ({c.code})
        </option>
      ))}
    </select>
  );
}
