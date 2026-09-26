/**
 * Public race calendar API client — thin wrapper nad `/api/races/`.
 * Používá se z `/kalendar` page a landing proklikem.
 */
import { apiFetch } from "@/lib/api";

export interface Race {
  id: number;
  slug: string;
  name: string;
  date_start: string; // ISO YYYY-MM-DD
  date_end: string | null;
  date_display: string; // legacy raw string
  next_label: string; // "obvykle srpen" / "24.–30. 8." — preferred display
  next_year: number;
  distance_km: number;
  distances_note: string;
  elevation_m: number | null;
  elevation_per_km: number | null;
  terrain: string;
  sport: RaceSport;
  location: string;
  country: string;
  region: RaceRegion | "";
  url: string;
  series: RaceSeries;
  registration_status: RaceRegistrationStatus;
  registration_detail: string;
  is_top: boolean;
  has_warning: boolean;
  highlight: string;
  is_favorite: boolean;
  plan_status: RacePlanStatus | null;
}

export interface RacePlanEntry {
  status: RacePlanStatus;
  note: string;
  created_at: string;
  updated_at: string;
  race: Race;
}

export interface RacePlanResponse {
  count: number;
  results: RacePlanEntry[];
}

export interface PublicRacePlanResponse extends RacePlanResponse {
  user: { slug: string; display_name: string };
}

export type RaceSport = "trail" | "skialp";
export type RaceRegion =
  | "CZ"
  | "SK"
  | "PL"
  | "ALP"
  | "SEV"
  | "IBE"
  | "BAL"
  | "OST"
  | "SVET";

export const REGION_LABEL: Record<RaceRegion, string> = {
  CZ: "Česko",
  SK: "Slovensko",
  PL: "Polsko",
  ALP: "Alpy",
  SEV: "Skandinávie",
  IBE: "Ibérie",
  BAL: "Balkán / Řecko",
  OST: "Ostrovy",
  SVET: "Svět",
};

export type RaceSeries = "indep" | "utmb" | "wtm" | "sky" | "major";
export type RaceRegistrationStatus =
  | "open"
  | "lottery"
  | "sold_out"
  | "qualifier"
  | "closed"
  | "unknown";

// User's personal race plan status — jak si závod třídí (od zájmu po
// odběhnutí). Sdílené přes public profil pro atlety.
export type RacePlanStatus =
  | "interested"
  | "waiting_registration"
  | "registered"
  | "waitlist"
  | "completed";

export const PLAN_STATUS_LABEL: Record<RacePlanStatus, string> = {
  interested: "Zajímá mě",
  waiting_registration: "Čekám na registraci",
  registered: "Registrován",
  waitlist: "Na waitlistu",
  completed: "Absolvoval",
};

export const PLAN_STATUS_TONE: Record<RacePlanStatus, string> = {
  interested: "bg-surface-muted text-ink-700",
  waiting_registration: "bg-warning/10 text-warning",
  registered: "bg-success/10 text-success",
  waitlist: "bg-brand-soft/40 text-ink-900",
  completed: "bg-ink-900 text-canvas",
};

export const SERIES_LABEL: Record<RaceSeries, string> = {
  indep: "Nezávislý",
  utmb: "UTMB World Series",
  wtm: "World Trail Majors",
  sky: "Skyrunner Series",
  major: "Major",
};

export const REGISTRATION_LABEL: Record<RaceRegistrationStatus, string> = {
  open: "Volně",
  lottery: "Losování",
  sold_out: "Vyprodáno",
  qualifier: "Kvalifikace",
  closed: "Uzavřeno",
  unknown: "Nejasné",
};

export interface RaceFilters {
  q?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  country?: string;
  region?: RaceRegion;
  sport?: RaceSport;
  series?: RaceSeries;
  minKm?: number;
  maxKm?: number;
  favOnly?: boolean;
  topOnly?: boolean;
  past?: boolean;
}

export interface RaceListResponse {
  count: number;
  results: Race[];
}

function buildQuery(filters: RaceFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.country) params.set("country", filters.country);
  if (filters.region) params.set("region", filters.region);
  if (filters.sport) params.set("sport", filters.sport);
  if (filters.series) params.set("series", filters.series);
  if (filters.minKm) params.set("min_km", String(filters.minKm));
  if (filters.maxKm) params.set("max_km", String(filters.maxKm));
  if (filters.favOnly) params.set("fav", "1");
  if (filters.topOnly) params.set("top", "1");
  if (filters.past) params.set("past", "1");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const races = {
  list: (filters: RaceFilters = {}): Promise<RaceListResponse> =>
    apiFetch<RaceListResponse>(`/api/races/${buildQuery(filters)}`),
  countries: (): Promise<{ countries: string[] }> =>
    apiFetch<{ countries: string[] }>("/api/races/countries/"),
  // Přidání do plánu (POST) — optional status/note. Bez status =
  // default "interested".
  addToPlan: (
    slug: string,
    body: { status?: RacePlanStatus; note?: string } = {},
  ): Promise<RacePlanEntry> =>
    apiFetch<RacePlanEntry>(`/api/races/${slug}/favorite/`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Update statusu / poznámky (PATCH) — vyžaduje existující plan entry.
  updatePlan: (
    slug: string,
    body: { status?: RacePlanStatus; note?: string },
  ): Promise<RacePlanEntry> =>
    apiFetch<RacePlanEntry>(`/api/races/${slug}/favorite/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeFromPlan: (slug: string): Promise<{ deleted: boolean }> =>
    apiFetch<{ deleted: boolean }>(`/api/races/${slug}/favorite/`, {
      method: "DELETE",
    }),
  // Můj plán (auth). Filtry: status, year, sport.
  myPlan: (
    filters: { status?: RacePlanStatus; year?: number; sport?: RaceSport } = {},
  ): Promise<RacePlanResponse> => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.year) p.set("year", String(filters.year));
    if (filters.sport) p.set("sport", filters.sport);
    const q = p.toString();
    return apiFetch<RacePlanResponse>(`/api/races/mine/${q ? `?${q}` : ""}`);
  },
  // Public plán per user slug — pro sdílení „mrkni na můj plán 2027".
  publicPlan: (
    userSlug: string,
    filters: { status?: RacePlanStatus; year?: number; sport?: RaceSport } = {},
  ): Promise<PublicRacePlanResponse> => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.year) p.set("year", String(filters.year));
    if (filters.sport) p.set("sport", filters.sport);
    const q = p.toString();
    return apiFetch<PublicRacePlanResponse>(
      `/api/races/plan/${userSlug}/${q ? `?${q}` : ""}`,
    );
  },
  // Legacy alias — dřívější boolean API. Když on=true → add s default
  // interested, on=false → remove. Callery migrují postupně.
  favorite: (slug: string, on: boolean): Promise<unknown> =>
    on
      ? apiFetch(`/api/races/${slug}/favorite/`, { method: "POST" })
      : apiFetch(`/api/races/${slug}/favorite/`, { method: "DELETE" }),
};

/**
 * Format YYYY-MM-DD date range → „16. – 19. května 2027" / „16. května 2027".
 * Používá se v race row / card display. Když má race `date_display`
 * (např. „konec srpna (TBA)" nebo „13.–19. 9."), volá to caller
 * napřed a fallbackuje sem jen když `date_display` je prázdný.
 */
export function formatRaceDate(start: string, end: string | null): string {
  const s = new Date(start);
  if (!end || end === start) {
    return s.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  const e = new Date(end);
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (sameMonth) {
    // „16. – 19. května 2027"
    return `${s.getUTCDate()}. – ${e.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${s.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
  })} – ${e.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}
