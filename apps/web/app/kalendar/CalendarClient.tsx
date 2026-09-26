"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, auth, type User } from "@/lib/api";
import {
  formatRaceDate,
  races,
  REGION_LABEL,
  REGISTRATION_LABEL,
  SERIES_LABEL,
  type Race,
  type RaceFilters,
  type RaceRegion,
  type RaceSeries,
} from "@/lib/races";

/**
 * Client-side calendar UI — filtry (search, měsíc, země, série, moje ★),
 * sortovatelný list, ★ toggle pro logged-in uživatele. Sharp OA design
 * (canvas + amber, Geist Sans/Mono, no rounded-lg).
 *
 * Table na desktop, karta stack na mobilu — pattern převzatý z Ultra
 * kalendář 2027 reference (`/Users/hulin/Desktop/Ultra kalendář 2027.html`).
 */
type SortKey = "date" | "distance" | "elevation" | "name";

const MONTHS_CS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

const SERIES_FILTERS: { value: RaceSeries; label: string }[] = [
  { value: "utmb", label: "UTMB" },
  { value: "wtm", label: "WTM" },
  { value: "sky", label: "Sky" },
  { value: "major", label: "Major" },
  { value: "indep", label: "Nezávislý" },
];

const REGION_FILTERS: { value: RaceRegion; label: string }[] = (
  Object.keys(REGION_LABEL) as RaceRegion[]
).map((k) => ({ value: k, label: REGION_LABEL[k] }));

export function CalendarClient() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RaceFilters>({});
  const [sort, setSort] = useState<SortKey>("date");

  // Load auth state — no throw if anon.
  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Fetch races on filter change.
  const loadRaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await races.list(filters);
      setItems(resp.results);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Načtení kalendáře selhalo.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadRaces();
  }, [loadRaces]);

  // Sort items klientsky (backend řadí per default podle date_start,
  // jinými sortama tady škálujeme).
  const sorted = useMemo(() => {
    const cmp = (a: Race, b: Race): number => {
      switch (sort) {
        case "distance":
          return b.distance_km - a.distance_km;
        case "elevation":
          return (b.elevation_m ?? 0) - (a.elevation_m ?? 0);
        case "name":
          return a.name.localeCompare(b.name, "cs");
        case "date":
        default:
          return a.date_start.localeCompare(b.date_start);
      }
    };
    return [...items].sort(cmp);
  }, [items, sort]);

  const setFilter = (patch: Partial<RaceFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  const clearFilters = () => setFilters({});

  const toggleFavorite = async (race: Race) => {
    if (!user) {
      // Redirect na login s návratem
      window.location.href = "/login?next=/kalendar";
      return;
    }
    const nextOn = !race.is_favorite;
    // Optimistic update
    setItems((prev) =>
      prev.map((r) => (r.id === race.id ? { ...r, is_favorite: nextOn } : r)),
    );
    try {
      await races.favorite(race.slug, nextOn);
    } catch {
      // Rollback
      setItems((prev) =>
        prev.map((r) =>
          r.id === race.id ? { ...r, is_favorite: !nextOn } : r,
        ),
      );
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      {/* FILTER PANEL */}
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Hledat závod, zemi, pohoří (např. Beskydy, Alpy)…"
            value={filters.q ?? ""}
            onChange={(e) => setFilter({ q: e.target.value })}
            className="min-w-[240px] flex-1 rounded-sm border border-border bg-canvas px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus-ring"
            aria-label="Hledat"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-sm border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
            aria-label="Řazení"
          >
            <option value="date">Řadit: podle termínu</option>
            <option value="distance">Nejdelší</option>
            <option value="elevation">Největší převýšení</option>
            <option value="name">Abecedně</option>
          </select>
          {/* Sport toggle — trail (běh) vs skialp. Přepnutí okamžitě
              filtruje list. */}
          <div className="inline-flex overflow-hidden rounded-sm border border-border">
            {[
              { value: undefined, label: "Vše" },
              { value: "trail" as const, label: "Běh" },
              { value: "skialp" as const, label: "Skialp" },
            ].map((opt) => {
              const active = filters.sport === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setFilter({ sport: opt.value })}
                  aria-pressed={active}
                  className={`px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                    active
                      ? "bg-ink-900 text-canvas"
                      : "bg-canvas text-ink-700 hover:bg-surface-muted"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {user && (
            <button
              type="button"
              onClick={() => setFilter({ favOnly: !filters.favOnly })}
              aria-pressed={filters.favOnly ?? false}
              className={`rounded-sm border px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                filters.favOnly
                  ? "border-ink-900 bg-ink-900 text-canvas"
                  : "border-border bg-canvas text-ink-700 hover:bg-surface-muted"
              }`}
            >
              ★ Jen moje oblíbené
            </button>
          )}
        </div>

        {/* Chip rows */}
        <div className="mt-4 flex flex-col gap-3">
          <ChipRow label="Měsíc">
            {MONTHS_CS.map((m, i) => {
              const key = `2027-${String(i + 1).padStart(2, "0")}`;
              const active = filters.month === key;
              return (
                <Chip
                  key={m}
                  active={active}
                  onClick={() =>
                    setFilter({ month: active ? undefined : key })
                  }
                >
                  {m}
                </Chip>
              );
            })}
          </ChipRow>
          <ChipRow label="Délka">
            {[
              { label: "40+ km", min: 40, max: undefined },
              { label: "80+ km", min: 80, max: undefined },
              { label: "100+ km", min: 100, max: undefined },
              { label: "150+ km", min: 150, max: undefined },
            ].map((preset) => {
              const active =
                filters.minKm === preset.min && filters.maxKm === preset.max;
              return (
                <Chip
                  key={preset.label}
                  active={active}
                  onClick={() =>
                    setFilter({
                      minKm: active ? undefined : preset.min,
                      maxKm: active ? undefined : preset.max,
                    })
                  }
                >
                  {preset.label}
                </Chip>
              );
            })}
          </ChipRow>
          <ChipRow label="Série">
            {SERIES_FILTERS.map((s) => {
              const active = filters.series === s.value;
              return (
                <Chip
                  key={s.value}
                  active={active}
                  onClick={() =>
                    setFilter({ series: active ? undefined : s.value })
                  }
                >
                  {s.label}
                </Chip>
              );
            })}
          </ChipRow>
          <ChipRow label="Region">
            {REGION_FILTERS.map((r) => {
              const active = filters.region === r.value;
              return (
                <Chip
                  key={r.value}
                  active={active}
                  onClick={() =>
                    setFilter({ region: active ? undefined : r.value })
                  }
                >
                  {r.label}
                </Chip>
              );
            })}
          </ChipRow>
        </div>
      </div>

      {/* META bar — count + clear */}
      <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
        <span>
          {loading
            ? "Načítám…"
            : error
              ? "Chyba"
              : `${sorted.length} závodů`}
        </span>
        {Object.keys(filters).length > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-brand hover:underline"
          >
            Zrušit filtry
          </button>
        )}
      </div>

      {/* CONTENT */}
      {error ? (
        <div className="mt-6 rounded-sm border border-danger/40 bg-danger-soft/40 p-4 text-sm text-danger">
          {error}
        </div>
      ) : loading ? (
        <div className="mt-8 flex justify-center py-10">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-8 rounded-sm border border-dashed border-border p-10 text-center text-sm text-ink-500">
          Žádný závod nesplňuje filtr. Zkus je zrušit nebo změnit rozsah.
        </div>
      ) : (
        <>
          {/* Desktop table (hidden < md) */}
          <div className="mt-6 hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b-2 border-ink-900 bg-surface">
                  <Th>Závod</Th>
                  <Th align="right">Délka</Th>
                  <Th align="right">Převýšení</Th>
                  <Th>Kdy</Th>
                  <Th>Série</Th>
                  <Th>Přihláška</Th>
                  <Th align="center">★</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <RaceRow
                    key={r.id}
                    race={r}
                    onFavorite={() => toggleFavorite(r)}
                    isLoggedIn={!!user}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-6 flex flex-col gap-3 md:hidden">
            {sorted.map((r) => (
              <RaceCard
                key={r.id}
                race={r}
                onFavorite={() => toggleFavorite(r)}
                isLoggedIn={!!user}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mono-tag min-w-[70px] text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] transition-colors focus-ring ${
        active
          ? "border-ink-900 bg-ink-900 text-canvas"
          : "border-border bg-canvas text-ink-900 hover:border-ink-500"
      }`}
    >
      {children}
    </button>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="mono-tag px-3 py-2 text-ink-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function RaceRow({
  race,
  onFavorite,
  isLoggedIn,
}: {
  race: Race;
  onFavorite: () => void;
  isLoggedIn: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-muted">
      <td className="px-3 py-3 align-top">
        <div className="flex items-start gap-2">
          <RegistrationBadge status={race.registration_status} />
        </div>
        <div className="mt-1">
          {race.url ? (
            <a
              href={race.url}
              target="_blank"
              rel="noreferrer"
              className="text-[15px] font-semibold text-ink-900 hover:underline"
            >
              {race.name} <span aria-hidden>↗</span>
            </a>
          ) : (
            <span className="text-[15px] font-semibold text-ink-900">
              {race.name}
            </span>
          )}
          {race.highlight && (
            <p className="mt-1 max-w-lg text-[13px] leading-snug text-ink-500">
              {race.highlight}
            </p>
          )}
          {(race.location || race.country) && (
            <p className="mt-0.5 text-[12px] text-ink-300">
              {[race.location, race.country].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
        <span className="text-[15px] font-semibold text-ink-900">
          {race.distance_km}
        </span>
        <span className="ml-1 text-[11px] text-ink-500">km</span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
        {race.elevation_m ? (
          <>
            <span className="text-[14px] font-medium text-ink-900">
              {race.elevation_m.toLocaleString("cs-CZ")}
            </span>
            <span className="ml-1 text-[11px] text-ink-500">m</span>
            {race.elevation_per_km && (
              <p className="text-[11px] text-ink-500">
                {race.elevation_per_km.toFixed(0)} m/km
              </p>
            )}
          </>
        ) : (
          <span className="text-[12px] text-ink-300">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top text-[13px] text-ink-700">
        {race.date_display || formatRaceDate(race.date_start, race.date_end)}
      </td>
      <td className="px-3 py-3 align-top text-[12px] text-ink-700">
        <SeriesBadge series={race.series} />
      </td>
      <td className="px-3 py-3 align-top text-[12px] text-ink-500">
        {REGISTRATION_LABEL[race.registration_status]}
      </td>
      <td className="px-3 py-3 text-center align-top">
        <FavoriteButton
          isFavorite={race.is_favorite}
          isLoggedIn={isLoggedIn}
          onClick={onFavorite}
        />
      </td>
    </tr>
  );
}

function RaceCard({
  race,
  onFavorite,
  isLoggedIn,
}: {
  race: Race;
  onFavorite: () => void;
  isLoggedIn: boolean;
}) {
  return (
    <article className="relative rounded-sm border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RegistrationBadge status={race.registration_status} />
            <SeriesBadge series={race.series} />
          </div>
          {race.url ? (
            <a
              href={race.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-lg font-semibold text-ink-900 hover:underline"
            >
              {race.name} <span aria-hidden>↗</span>
            </a>
          ) : (
            <h3 className="mt-2 text-lg font-semibold text-ink-900">
              {race.name}
            </h3>
          )}
          {(race.location || race.country) && (
            <p className="mt-0.5 text-[13px] text-ink-500">
              {[race.location, race.country].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <FavoriteButton
          isFavorite={race.is_favorite}
          isLoggedIn={isLoggedIn}
          onClick={onFavorite}
        />
      </div>
      {race.highlight && (
        <p className="mt-3 text-[13px] leading-snug text-ink-700">
          {race.highlight}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="mono-tag text-ink-500">Délka</dt>
          <dd className="mt-0.5 text-[15px] font-semibold text-ink-900 tabular-nums">
            {race.distance_km} <span className="text-[10px] text-ink-500">km</span>
          </dd>
        </div>
        <div>
          <dt className="mono-tag text-ink-500">Převýšení</dt>
          <dd className="mt-0.5 text-[15px] font-semibold text-ink-900 tabular-nums">
            {race.elevation_m
              ? `${race.elevation_m.toLocaleString("cs-CZ")} m`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="mono-tag text-ink-500">Termín</dt>
          <dd className="mt-0.5 text-[13px] font-medium text-ink-900">
            {race.date_display || formatRaceDate(race.date_start, race.date_end)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function RegistrationBadge({ status }: { status: Race["registration_status"] }) {
  const label = REGISTRATION_LABEL[status];
  const tone = {
    open: "border-success/40 bg-success/5 text-success",
    lottery: "border-danger/40 bg-danger-soft/40 text-danger",
    sold_out: "border-warning/40 bg-warning/5 text-warning",
    qualifier: "border-ink-300 bg-surface-muted text-ink-700",
    closed: "border-border bg-surface-muted text-ink-500",
  }[status];
  return (
    <span
      className={`mono-tag inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] ${tone}`}
    >
      {label}
    </span>
  );
}

function SeriesBadge({ series }: { series: Race["series"] }) {
  if (series === "indep") return null;
  const label = SERIES_LABEL[series];
  const tone = {
    utmb: "border-ink-900 text-ink-900",
    wtm: "border-brand text-ink-900 bg-brand-soft/40",
    sky: "border-ink-500 text-ink-700",
    major: "border-ink-900 bg-ink-900 text-canvas",
    indep: "",
  }[series];
  return (
    <span
      className={`mono-tag inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function FavoriteButton({
  isFavorite,
  isLoggedIn,
  onClick,
}: {
  isFavorite: boolean;
  isLoggedIn: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        isFavorite
          ? "Odebrat z oblíbených"
          : isLoggedIn
            ? "Přidat do oblíbených"
            : "Přihlas se pro oblíbené"
      }
      aria-pressed={isFavorite}
      className="focus-ring rounded-sm p-1 text-2xl leading-none transition-colors"
      style={{
        color: isFavorite ? "var(--brand)" : "var(--ink-300)",
      }}
    >
      {isFavorite ? "★" : "☆"}
    </button>
  );
}
