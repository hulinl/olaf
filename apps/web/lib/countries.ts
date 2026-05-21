/**
 * ISO 3166-1 country list with Czech labels + international dialing
 * code. Used by the <CountryPicker> on profile / billing settings so
 * every country value in the DB is a normalised 2-letter code instead
 * of "CR" / "Česko" / "Czech Republic" free-text.
 *
 * Ordered: CZ first (the dominant locale), then SK + neighbours,
 * then alphabetical. Not exhaustive — covers what an outdoor
 * community in Central Europe actually encounters. Add more as
 * needed; backend stores any 2-letter code.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  /** Czech name shown in the dropdown. */
  name: string;
  /** Phone dial code with leading "+". */
  dial: string;
}

export const COUNTRIES: Country[] = [
  { code: "CZ", name: "Česko", dial: "+420" },
  { code: "SK", name: "Slovensko", dial: "+421" },
  { code: "AT", name: "Rakousko", dial: "+43" },
  { code: "DE", name: "Německo", dial: "+49" },
  { code: "PL", name: "Polsko", dial: "+48" },
  { code: "HU", name: "Maďarsko", dial: "+36" },
  { code: "SI", name: "Slovinsko", dial: "+386" },
  { code: "HR", name: "Chorvatsko", dial: "+385" },
  { code: "IT", name: "Itálie", dial: "+39" },
  { code: "FR", name: "Francie", dial: "+33" },
  { code: "ES", name: "Španělsko", dial: "+34" },
  { code: "GB", name: "Velká Británie", dial: "+44" },
  { code: "IE", name: "Irsko", dial: "+353" },
  { code: "NL", name: "Nizozemsko", dial: "+31" },
  { code: "BE", name: "Belgie", dial: "+32" },
  { code: "CH", name: "Švýcarsko", dial: "+41" },
  { code: "DK", name: "Dánsko", dial: "+45" },
  { code: "SE", name: "Švédsko", dial: "+46" },
  { code: "NO", name: "Norsko", dial: "+47" },
  { code: "FI", name: "Finsko", dial: "+358" },
  { code: "RO", name: "Rumunsko", dial: "+40" },
  { code: "BG", name: "Bulharsko", dial: "+359" },
  { code: "RS", name: "Srbsko", dial: "+381" },
  { code: "BA", name: "Bosna a Hercegovina", dial: "+387" },
  { code: "ME", name: "Černá Hora", dial: "+382" },
  { code: "MK", name: "Severní Makedonie", dial: "+389" },
  { code: "AL", name: "Albánie", dial: "+355" },
  { code: "GR", name: "Řecko", dial: "+30" },
  { code: "PT", name: "Portugalsko", dial: "+351" },
  { code: "US", name: "Spojené státy", dial: "+1" },
  { code: "CA", name: "Kanada", dial: "+1" },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function findCountry(code: string | undefined | null): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function dialForCountry(code: string | undefined | null): string | null {
  return findCountry(code)?.dial ?? null;
}

/**
 * If the phone is empty OR doesn't already start with any "+…" dial
 * code, prefix it with the dial code for `countryCode`. Used when the
 * user changes the Country dropdown — so the phone gets a sensible
 * default prefix without overwriting a number that's already been
 * entered with an explicit prefix.
 */
export function applyDialPrefix(
  phone: string,
  countryCode: string,
): string {
  const dial = dialForCountry(countryCode);
  if (!dial) return phone;
  const trimmed = phone.trim();
  if (!trimmed) {
    return `${dial} `;
  }
  if (trimmed.startsWith("+")) {
    // User already has a prefix — leave it alone.
    return phone;
  }
  // Replace leading digits-only with prefix + same digits.
  return `${dial} ${trimmed}`;
}
