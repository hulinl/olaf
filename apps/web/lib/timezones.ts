/**
 * Curated + generated seznam IANA time zones pro dropdown v settings.
 *
 * Nejčastější czech-first možnosti nahoře v optgroupu „Nejčastější",
 * zbytek nabídnutý členěný po kontinentech pro případ, kdy komunita
 * pracuje pro zahraniční skupinu. Fallback (pokud běhový engine
 * nezná `Intl.supportedValuesOf`) drží jen curated list — víc než dost
 * pro V1.
 */
export interface TzGroup {
  label: string;
  values: string[];
}

const COMMON = [
  "Europe/Prague",
  "Europe/Bratislava",
  "Europe/Vienna",
  "Europe/Berlin",
  "Europe/Warsaw",
  "UTC",
];

const CONTINENT_LABELS: Record<string, string> = {
  Africa: "Afrika",
  America: "Amerika",
  Antarctica: "Antarktida",
  Asia: "Asie",
  Atlantic: "Atlantik",
  Australia: "Austrálie",
  Europe: "Evropa",
  Indian: "Indický oceán",
  Pacific: "Tichomoří",
};

const CONTINENT_ORDER = [
  "Europe",
  "America",
  "Asia",
  "Africa",
  "Australia",
  "Pacific",
  "Atlantic",
  "Indian",
  "Antarctica",
];

function safeList(): string[] {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return COMMON;
}

export function timezoneGroups(): TzGroup[] {
  const all = safeList();
  const buckets = new Map<string, string[]>();
  for (const tz of all) {
    if (COMMON.includes(tz)) continue;
    const cont = tz.split("/")[0] ?? "Other";
    if (!buckets.has(cont)) buckets.set(cont, []);
    buckets.get(cont)!.push(tz);
  }
  const groups: TzGroup[] = [
    { label: "Nejčastější", values: [...COMMON] },
  ];
  for (const cont of CONTINENT_ORDER) {
    const values = buckets.get(cont);
    if (!values || values.length === 0) continue;
    values.sort();
    groups.push({ label: CONTINENT_LABELS[cont] ?? cont, values });
  }
  const seen = new Set(CONTINENT_ORDER);
  for (const [cont, values] of buckets) {
    if (seen.has(cont)) continue;
    values.sort();
    groups.push({ label: CONTINENT_LABELS[cont] ?? cont, values });
  }
  return groups;
}
