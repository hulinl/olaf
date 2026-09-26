"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ApiError, auth, type User } from "@/lib/api";
import {
  races,
  type Race,
  type RaceFilters,
  type RaceRegion,
} from "@/lib/races";

/**
 * Ultra kalendář client — 1:1 replika layoutu z
 * `/Users/hulin/Desktop/Ultra kalendář 2027.html` (jen barevný swap:
 * red accent → OLAF amber). Ostatní pravidla (Barlow Condensed
 * display font, mode toggles, chip pills, sortable columns, mobile
 * card grid via data-l labels) drží přesnou strukturu.
 */

type SortKey = "date" | "distance" | "elevation" | "steep" | "name";
type SortDir = "asc" | "desc";

const MONTHS_CS = [
  { key: 1, label: "led" },
  { key: 2, label: "úno" },
  { key: 3, label: "bře" },
  { key: 4, label: "dub" },
  { key: 5, label: "kvě" },
  { key: 6, label: "čvn" },
  { key: 7, label: "čvc" },
  { key: 8, label: "srp" },
  { key: 9, label: "zář" },
  { key: 10, label: "říj" },
  { key: 11, label: "lis" },
  { key: 12, label: "pro" },
];

const REGION_FILTERS: { value: RaceRegion; label: string; color: string }[] = [
  { value: "CZ", label: "Česko", color: "#c8102e" },
  { value: "SKPL", label: "SK / PL", color: "#1f8a4c" },
  { value: "ALP", label: "Alpy", color: "#1d5fbf" },
  { value: "IBE", label: "Ibérie", color: "#e0671b" },
  { value: "BAL", label: "Balkán", color: "#8a5a2b" },
  { value: "SEV", label: "Sever", color: "#7b3fa6" },
  { value: "OST", label: "Ostrovy", color: "#e8b100" },
  { value: "SVET", label: "Svět", color: "#15231d" },
];

const LENGTH_PRESETS = [
  { label: "40+", min: 40, max: undefined },
  { label: "80+", min: 80, max: undefined },
  { label: "100+", min: 100, max: undefined },
  { label: "150+", min: 150, max: undefined },
  { label: "300+", min: 300, max: undefined },
];

const SERIES_FILTERS = [
  { value: "utmb" as const, label: "UTMB" },
  { value: "wtm" as const, label: "WTM" },
  { value: "sky" as const, label: "Sky" },
  { value: "major" as const, label: "Major" },
  { value: "indep" as const, label: "Nezávislý" },
];

const REG_FILTERS = [
  { value: "open" as const, label: "Volně", code: "V" },
  { value: "lottery" as const, label: "Losování", code: "L" },
  { value: "sold_out" as const, label: "Vyprodáno", code: "S" },
  { value: "qualifier" as const, label: "Kvalifikace", code: "Q" },
  { value: "closed" as const, label: "Uzavřeno", code: "K" },
];

const REG_CODE: Record<Race["registration_status"], string> = {
  open: "V",
  lottery: "L",
  sold_out: "S",
  qualifier: "K",
  closed: "K",
  unknown: "Q",
};
const REG_LABEL: Record<Race["registration_status"], string> = {
  open: "VOLNĚ",
  lottery: "LOSOVÁNÍ",
  sold_out: "VYPRODÁNO",
  qualifier: "KVALIFIKACE",
  closed: "UZAVŘENO",
  unknown: "TBA / NEJASNÉ",
};

const SERIES_TAG_CLASS: Record<Race["series"], string> = {
  utmb: "uk-tag uk-tag-utmb",
  wtm: "uk-tag uk-tag-wtm",
  sky: "uk-tag uk-tag-sky",
  major: "uk-tag uk-tag-major",
  indep: "uk-tag",
};

const REGION_LABEL_BY_CODE: Record<string, string> = REGION_FILTERS.reduce(
  (acc, r) => ({ ...acc, [r.value]: r.label }),
  {},
);
const REGION_COLOR_BY_CODE: Record<string, string> = REGION_FILTERS.reduce(
  (acc, r) => ({ ...acc, [r.value]: r.color }),
  {},
);

export function CalendarClient() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RaceFilters>({
    sport: "trail",
    topOnly: true,
  });
  const [regFilter, setRegFilter] = useState<Race["registration_status"] | null>(
    null,
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "date",
    dir: "asc",
  });
  const [statsMount, setStatsMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setStatsMount(document.getElementById("kalendar-stats"));
  }, []);

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

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: Race, b: Race): number => {
      switch (sort.key) {
        case "distance":
          return dir * (a.distance_km - b.distance_km);
        case "elevation":
          return dir * ((a.elevation_m ?? 0) - (b.elevation_m ?? 0));
        case "steep":
          return dir * ((a.elevation_per_km ?? 0) - (b.elevation_per_km ?? 0));
        case "name":
          return dir * a.name.localeCompare(b.name, "cs");
        case "date":
        default:
          return dir * a.date_start.localeCompare(b.date_start);
      }
    };
    const filtered = regFilter
      ? items.filter((r) => r.registration_status === regFilter)
      : items;
    return [...filtered].sort(cmp);
  }, [items, sort, regFilter]);

  const maxSteep = useMemo(
    () => Math.max(...items.map((r) => r.elevation_per_km ?? 0), 110),
    [items],
  );

  const stats = useMemo(
    () => ({
      total: items.length,
      trail: items.filter((r) => r.sport === "trail").length,
      skialp: items.filter((r) => r.sport === "skialp").length,
      favs: items.filter((r) => r.is_favorite).length,
    }),
    [items],
  );

  const setFilter = (patch: Partial<RaceFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };
  const clearFilters = () => {
    setFilters({ sport: filters.sport, topOnly: filters.topOnly });
    setRegFilter(null);
  };

  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      return { key, dir: s.dir === "asc" ? "desc" : "asc" };
    });
  };

  const toggleFavorite = async (race: Race) => {
    if (!user) {
      window.location.href = "/login?next=/kalendar";
      return;
    }
    const nextOn = !race.is_favorite;
    setItems((prev) =>
      prev.map((r) => (r.id === race.id ? { ...r, is_favorite: nextOn } : r)),
    );
    try {
      await races.favorite(race.slug, nextOn);
    } catch {
      setItems((prev) =>
        prev.map((r) =>
          r.id === race.id ? { ...r, is_favorite: !nextOn } : r,
        ),
      );
    }
  };

  return (
    <>
      {statsMount &&
        createPortal(
          <>
            <StatBlock label="závodů" value={stats.total} />
            <StatBlock label="běh" value={stats.trail} />
            <StatBlock label="skialp" value={stats.skialp} />
            <StatBlock label="v plánu" value={stats.favs} />
          </>,
          statsMount,
        )}

      <section className="mx-auto w-full max-w-[1320px] px-4 pb-16">
        {/* Filter section */}
        <section
          aria-label="Filtry"
          className="mt-3 grid gap-3 rounded-md border border-border bg-surface p-4"
        >
          {/* Row 1: sport + view mode toggles */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="uk-mode" role="group" aria-label="Sport">
              <button
                type="button"
                aria-pressed={filters.sport === "trail"}
                onClick={() => setFilter({ sport: "trail" })}
              >
                Běh
              </button>
              <button
                type="button"
                aria-pressed={filters.sport === "skialp"}
                onClick={() => setFilter({ sport: "skialp" })}
              >
                Skialp
              </button>
            </div>
            <div className="uk-mode" role="group" aria-label="Rozsah">
              <button
                type="button"
                aria-pressed={filters.topOnly === true}
                onClick={() => setFilter({ topOnly: true })}
              >
                Top výběr
              </button>
              <button
                type="button"
                aria-pressed={filters.topOnly !== true}
                onClick={() => setFilter({ topOnly: false })}
              >
                Vše
              </button>
            </div>
            <span className="text-sm text-ink-500">
              {filters.topOnly
                ? "Vlajkové závody sezóny"
                : filters.sport === "trail"
                  ? "Kompletní seznam ultra a horských závodů"
                  : "Skialpové závody a rallye"}
            </span>
          </div>

          {/* Row 2: search + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Hledat závod, zemi, pohoří (např. Beskydy, Dolomity)…"
              value={filters.q ?? ""}
              onChange={(e) => setFilter({ q: e.target.value })}
              className="min-w-[240px] flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus-ring"
              aria-label="Hledat"
            />
            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [
                  SortKey,
                  SortDir,
                ];
                setSort({ key, dir });
              }}
              className="rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
              aria-label="Řazení"
            >
              <option value="date:asc">Řadit: podle termínu</option>
              <option value="distance:desc">Nejdelší</option>
              <option value="elevation:desc">Největší převýšení</option>
              <option value="steep:desc">Nejstrmější (m/km)</option>
              <option value="name:asc">Abecedně</option>
            </select>
            {user && (
              <button
                type="button"
                className="uk-chip"
                aria-pressed={filters.favOnly ?? false}
                onClick={() => setFilter({ favOnly: !filters.favOnly })}
              >
                ★ Jen můj plán
              </button>
            )}
          </div>

          {/* Chip rows */}
          <ChipRow label="Oblast">
            {REGION_FILTERS.map((r) => (
              <button
                key={r.value}
                type="button"
                className="uk-chip"
                aria-pressed={filters.region === r.value}
                onClick={() =>
                  setFilter({
                    region: filters.region === r.value ? undefined : r.value,
                  })
                }
              >
                <span
                  className="uk-mk"
                  style={{ ["--c" as string]: r.color }}
                  aria-hidden
                />
                {r.label}
              </button>
            ))}
          </ChipRow>

          <ChipRow label="Měsíc">
            {MONTHS_CS.map((m) => {
              const year = filters.year ?? 2027;
              const key = `${year}-${String(m.key).padStart(2, "0")}`;
              const active = filters.month === key;
              return (
                <button
                  key={m.key}
                  type="button"
                  className="uk-chip uk-compact"
                  aria-pressed={active}
                  onClick={() =>
                    setFilter({ month: active ? undefined : key })
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </ChipRow>

          <ChipRow label="Délka">
            {LENGTH_PRESETS.map((preset) => {
              const active =
                filters.minKm === preset.min && filters.maxKm === preset.max;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className="uk-chip"
                  aria-pressed={active}
                  onClick={() =>
                    setFilter({
                      minKm: active ? undefined : preset.min,
                      maxKm: active ? undefined : preset.max,
                    })
                  }
                >
                  {preset.label} km
                </button>
              );
            })}
          </ChipRow>

          <ChipRow label="Série">
            {SERIES_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                className="uk-chip"
                aria-pressed={filters.series === s.value}
                onClick={() =>
                  setFilter({
                    series: filters.series === s.value ? undefined : s.value,
                  })
                }
              >
                {s.label}
              </button>
            ))}
          </ChipRow>

          <ChipRow label="Přihláška">
            {REG_FILTERS.map((r) => {
              const active = regFilter === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  className="uk-chip"
                  aria-pressed={active}
                  onClick={() => setRegFilter(active ? null : r.value)}
                >
                  <span
                    className={`uk-rg uk-rg-${r.code}`}
                    style={{ marginBottom: 0 }}
                  >
                    {r.code}
                  </span>
                  {r.label}
                </button>
              );
            })}
          </ChipRow>
        </section>

        {/* Meta bar */}
        <div className="mt-3.5 mb-2 flex items-center justify-between text-[13.5px] text-ink-500">
          <span>
            {loading
              ? "Načítám…"
              : error
                ? "Chyba"
                : `Zobrazeno ${sorted.length} závodů`}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="text-brand underline underline-offset-2 hover:no-underline"
          >
            Zrušit filtry
          </button>
        </div>

        {/* Table */}
        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger-soft/40 p-4 text-sm text-danger">
            {error}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-10">
            <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-ink-500">
            Žádný závod nesplňuje filtr.
          </div>
        ) : (
          <div className="uk-tblwrap overflow-x-auto rounded-md border border-border bg-surface">
            <table className="uk-tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Plán</th>
                  <ThSortable
                    label="Závod"
                    sortKey="name"
                    current={sort}
                    onToggle={toggleSort}
                  />
                  <th>Země</th>
                  <ThSortable
                    label="Termín"
                    sortKey="date"
                    current={sort}
                    onToggle={toggleSort}
                  />
                  <th>Přihláška</th>
                  <th>Tratě (km)</th>
                  <ThSortable
                    label="Hlavní"
                    sortKey="distance"
                    current={sort}
                    onToggle={toggleSort}
                    className="uk-num"
                  />
                  <ThSortable
                    label="D+"
                    sortKey="elevation"
                    current={sort}
                    onToggle={toggleSort}
                    className="uk-num"
                  />
                  <ThSortable
                    label="m/km"
                    sortKey="steep"
                    current={sort}
                    onToggle={toggleSort}
                    className="uk-num"
                  />
                  <th>Série</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <RaceRow
                    key={r.id}
                    race={r}
                    onFavorite={() => toggleFavorite(r)}
                    maxSteep={maxSteep}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className="font-condensed font-bold text-ink-900 tabular-nums"
        style={{ fontSize: "clamp(26px, 3vw, 34px)", lineHeight: 1 }}
      >
        {value}
      </span>
      <span className="mono-tag text-ink-500">{label}</span>
    </div>
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
      <span className="uk-lbl">{label}</span>
      {children}
    </div>
  );
}

function ThSortable({
  label,
  sortKey,
  current,
  onToggle,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onToggle: (k: SortKey) => void;
  className?: string;
}) {
  const active = current.key === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        data-dir={active ? current.dir : undefined}
      >
        {label}
      </button>
    </th>
  );
}

function RaceRow({
  race,
  onFavorite,
  maxSteep,
}: {
  race: Race;
  onFavorite: () => void;
  maxSteep: number;
}) {
  const steep = race.elevation_per_km ?? 0;
  const steepPct = maxSteep > 0 ? Math.min(100, (steep / maxSteep) * 100) : 0;
  const regionColor = REGION_COLOR_BY_CODE[race.region] || "#15231d";
  const regionLabel = REGION_LABEL_BY_CODE[race.region] || "";
  const regCode = REG_CODE[race.registration_status];
  return (
    <tr>
      <td className="uk-c-plan">
        <button
          type="button"
          className="uk-star"
          aria-pressed={race.is_favorite}
          aria-label={
            race.is_favorite ? "Odebrat z plánu" : "Přidat do plánu"
          }
          onClick={onFavorite}
        >
          ★
        </button>
      </td>
      <td className="uk-c-name">
        <div className="uk-name">
          <span
            className="uk-mk"
            style={{ ["--c" as string]: regionColor }}
            title={regionLabel}
            aria-hidden
          />
          {race.url ? (
            <a href={race.url} target="_blank" rel="noreferrer">
              {race.name}
            </a>
          ) : (
            <span>{race.name}</span>
          )}
          {race.is_top && <span className="uk-topb">TOP</span>}
        </div>
        {race.highlight && <div className="uk-hl">{race.highlight}</div>}
        {race.has_warning && (
          <span
            className="mt-1 inline-block rounded-sm bg-warning/10 px-1.5 py-0.5 text-[12px] font-medium text-warning"
          >
            termín nejistý
          </span>
        )}
      </td>
      <td className="uk-c-country" data-l="Země">
        <div>{race.country}</div>
        {(race.location || race.terrain) && (
          <div className="uk-place">
            {[race.location, race.terrain].filter(Boolean).join(" · ")}
          </div>
        )}
      </td>
      <td className="uk-c-when" data-l="Další ročník">
        <div className="uk-d27">
          {race.next_label || race.date_display || formatDateCompact(race.date_start)}
        </div>
        <div className="uk-d26">{race.next_year}</div>
      </td>
      <td className="uk-c-entry uk-entry" data-l="Přihláška">
        <span className={`uk-rg uk-rg-${regCode}`}>
          {REG_LABEL[race.registration_status]}
        </span>
        {race.registration_detail && (
          <div className="mt-1 leading-snug">{race.registration_detail}</div>
        )}
      </td>
      <td className="uk-c-dist uk-dist" data-l="Tratě (km)">
        {race.distances_note || race.distance_km}
      </td>
      <td className="uk-num" data-l="Hlavní km">
        <span className="uk-big">{race.distance_km.toLocaleString("cs-CZ")}</span>
      </td>
      <td className="uk-num" data-l="D+ (m)">
        <span className="uk-big">
          {race.elevation_m
            ? race.elevation_m.toLocaleString("cs-CZ")
            : "–"}
        </span>
      </td>
      <td className="uk-num" data-l="m/km">
        <div className="uk-steep">
          <span className="uk-bar">
            <i style={{ width: `${steepPct}%` }} />
          </span>
          <span>{race.elevation_per_km ? Math.round(race.elevation_per_km) : "–"}</span>
        </div>
      </td>
      <td className="uk-c-series" data-l="Série">
        <span className={SERIES_TAG_CLASS[race.series]}>
          {seriesLabel(race.series)}
        </span>
      </td>
    </tr>
  );
}

function formatDateCompact(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" });
}

function seriesLabel(s: Race["series"]): string {
  return (
    {
      utmb: "UTMB",
      wtm: "WTM",
      sky: "Sky",
      major: "Major",
      indep: "Nezávislý",
    } satisfies Record<Race["series"], string>
  )[s];
}
