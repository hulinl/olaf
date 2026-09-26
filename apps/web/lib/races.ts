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
  distance_km: number;
  elevation_m: number | null;
  elevation_per_km: number | null;
  terrain: string;
  location: string;
  country: string;
  url: string;
  series: RaceSeries;
  registration_status: RaceRegistrationStatus;
  highlight: string;
  is_favorite: boolean;
}

export type RaceSeries = "indep" | "utmb" | "wtm" | "sky" | "major";
export type RaceRegistrationStatus =
  | "open"
  | "lottery"
  | "sold_out"
  | "qualifier"
  | "closed";

export const SERIES_LABEL: Record<RaceSeries, string> = {
  indep: "Nezávislý",
  utmb: "UTMB World Series",
  wtm: "World Trail Majors",
  sky: "Skyrunner Series",
  major: "Major",
};

export const REGISTRATION_LABEL: Record<RaceRegistrationStatus, string> = {
  open: "Přihlášky otevřené",
  lottery: "Losování",
  sold_out: "Vyprodáno",
  qualifier: "Kvalifikace",
  closed: "Uzavřeno",
};

export interface RaceFilters {
  q?: string;
  month?: string; // YYYY-MM
  country?: string;
  series?: RaceSeries;
  minKm?: number;
  maxKm?: number;
  favOnly?: boolean;
  past?: boolean;
}

export interface RaceListResponse {
  count: number;
  results: Race[];
}

function buildQuery(filters: RaceFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.month) params.set("month", filters.month);
  if (filters.country) params.set("country", filters.country);
  if (filters.series) params.set("series", filters.series);
  if (filters.minKm) params.set("min_km", String(filters.minKm));
  if (filters.maxKm) params.set("max_km", String(filters.maxKm));
  if (filters.favOnly) params.set("fav", "1");
  if (filters.past) params.set("past", "1");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const races = {
  list: (filters: RaceFilters = {}): Promise<RaceListResponse> =>
    apiFetch<RaceListResponse>(`/api/races/${buildQuery(filters)}`),
  countries: (): Promise<{ countries: string[] }> =>
    apiFetch<{ countries: string[] }>("/api/races/countries/"),
  favorite: (slug: string, on: boolean): Promise<{ is_favorite: boolean }> =>
    apiFetch<{ is_favorite: boolean }>(
      `/api/races/${slug}/favorite/`,
      { method: on ? "POST" : "DELETE" },
    ),
};

/**
 * Format YYYY-MM-DD date range → „16. – 19. května 2027" / „16. května 2027".
 * Používá se v race row / card display.
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
