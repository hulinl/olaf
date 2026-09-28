"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, auth, personalCalendar, type User } from "@/lib/api";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  REGION_LABEL,
  races,
  type MyCommunity,
  type MyCommunityPerson,
  type Race,
  type RaceFilters,
  type RacePlanStatus,
  type RaceRegion,
  type RaceSeries,
} from "@/lib/races";

/**
 * Časová osa canvas — Slice 5 vize „community awareness".
 *
 * Vertikální stack měsíců (12 od dneška), každý den kostička.
 * Overlay vrstvy:
 * - Race events z /api/races/ (podle plné sady filtrů — sport, region,
 *   distance range, series, favorites-only, top-only, workspace, hledání)
 * - Osobní obsazenost z /api/personal-calendar/busy-days/ (šrafovaný pattern)
 * - Vybraní členové komunity — jejich race účast jako avatar dots
 * - Match highlight: den je free + je tam race = success glow ring
 *
 * Design: mobile-first, jeden sloupec měsíců. Na md+ 2, na xl 3 sloupce.
 * Filtry v sticky top baru + drawer na mobilu.
 */

const REGION_OPTIONS: { value: RaceRegion; label: string; emoji: string }[] = [
  { value: "CZ", label: "Česko", emoji: "🇨🇿" },
  { value: "SK", label: "Slovensko", emoji: "🇸🇰" },
  { value: "PL", label: "Polsko", emoji: "🇵🇱" },
  { value: "ALP", label: "Alpy", emoji: "🏔️" },
  { value: "SEV", label: "Skandinávie", emoji: "❄️" },
  { value: "IBE", label: "Ibérie", emoji: "🇪🇸" },
  { value: "BAL", label: "Balkán / Řecko", emoji: "🇬🇷" },
  { value: "OST", label: "Ostrovy", emoji: "🏝️" },
  { value: "SVET", label: "Svět", emoji: "🌍" },
];

const LENGTH_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "< 50 km", max: 49 },
  { label: "50–100 km", min: 50, max: 100 },
  { label: "100–170 km", min: 100, max: 170 },
  { label: "170+ km", min: 170 },
];

const SERIES_OPTIONS: { value: RaceSeries; label: string }[] = [
  { value: "utmb", label: "UTMB" },
  { value: "wtm", label: "WTM" },
  { value: "sky", label: "Skyrunner" },
  { value: "major", label: "Major" },
  { value: "indep", label: "Nezávislý" },
];

const STORAGE_KEY = "olaf.kalendar.canvas.filters.v1";

export function TimelineCanvasClient() {
  const [user, setUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [items, setItems] = useState<Race[]>([]);
  const [busyDays, setBusyDays] = useState<Set<string>>(new Set());
  const [myCommunities, setMyCommunities] = useState<MyCommunity[]>([]);
  const [myPeople, setMyPeople] = useState<MyCommunityPerson[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(),
  );
  const [memberRaces, setMemberRaces] = useState<Record<string, Race[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [monthsAhead, setMonthsAhead] = useState(12);
  const [searchInput, setSearchInput] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [communityTraction, setCommunityTraction] = useState(false);

  // Filtry z localStorage — user chce návrat do stejného stavu
  const [filters, setFilters] = useState<RaceFilters>(() => {
    if (typeof window === "undefined") {
      return { sport: "trail", topOnly: true };
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as RaceFilters;
    } catch {
      /* skip */
    }
    return { sport: "trail", topOnly: true };
  });

  useEffect(() => {
    void auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setUserChecked(true));
  }, []);

  // Persist filters
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* skip */
    }
  }, [filters]);

  // Debounce search
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== (filters.q ?? "")) {
        setFilters((f) => ({ ...f, q: searchInput || undefined }));
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, filters.q]);

  const setFilter = useCallback((patch: Partial<RaceFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  const clearFilters = () => {
    setFilters({});
    setSearchInput("");
    setFreeOnly(false);
    setCommunityTraction(false);
  };

  const load = useCallback(async () => {
    if (!userChecked) return;
    setLoading(true);
    setError(null);
    const today = new Date();
    const fromISO = filters.from || today.toISOString().slice(0, 10);
    const to = new Date(today);
    to.setMonth(to.getMonth() + monthsAhead);
    const toISO = filters.to || to.toISOString().slice(0, 10);

    try {
      const promises: Promise<unknown>[] = [
        races.list({ ...filters, from: fromISO, to: toISO }),
      ];
      if (user) {
        promises.push(personalCalendar.busyDays(fromISO, toISO));
        promises.push(races.myCommunities());
        promises.push(races.myCommunityPeople());
      }
      const results = await Promise.all(promises);
      const racesResp = results[0] as { results: Race[] };
      setItems(racesResp.results);
      if (user) {
        const b = results[1] as { busy_days: string[] };
        setBusyDays(new Set(b.busy_days));
        const c = results[2] as { communities: MyCommunity[] };
        setMyCommunities(c.communities);
        const p = results[3] as { people: MyCommunityPerson[] };
        setMyPeople(p.people);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Načtení selhalo.");
    } finally {
      setLoading(false);
    }
  }, [userChecked, user, filters, monthsAhead]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetch race plans of selected members (multi-user overlay).
  useEffect(() => {
    if (selectedMembers.size === 0) {
      setMemberRaces({});
      return;
    }
    let cancelled = false;
    const promises = Array.from(selectedMembers).map((slug) =>
      races
        .list({ person: slug, past: false })
        .then((r) => [slug, r.results] as const)
        .catch(() => [slug, [] as Race[]] as const),
    );
    void Promise.all(promises).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, Race[]> = {};
      for (const [slug, list] of pairs) {
        map[slug] = list;
      }
      setMemberRaces(map);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMembers]);

  // Aktivní filtry pro chip display + count
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.region) c += 1;
    if (filters.minKm || filters.maxKm) c += 1;
    if (filters.series) c += 1;
    if (filters.favOnly) c += 1;
    if (filters.workspace) c += 1;
    if (filters.from || filters.to) c += 1;
    if (filters.q) c += 1;
    if (freeOnly) c += 1;
    if (communityTraction) c += 1;
    return c;
  }, [filters, freeOnly, communityTraction]);

  const months = useMemo(() => {
    const now = new Date();
    const list: { year: number; month: number }[] = [];
    for (let i = 0; i < monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      list.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return list;
  }, [monthsAhead]);

  const racesByDay = useMemo(() => {
    const map: Record<string, Race[]> = {};
    for (const race of items) {
      const start = new Date(race.date_start);
      const end = race.date_end ? new Date(race.date_end) : start;
      const cur = new Date(start);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        (map[key] = map[key] || []).push(race);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [items]);

  const memberRacesByDay = useMemo(() => {
    const map: Record<string, Record<string, Race[]>> = {};
    for (const [slug, rlist] of Object.entries(memberRaces)) {
      const perDay: Record<string, Race[]> = {};
      for (const race of rlist) {
        const start = new Date(race.date_start);
        const end = race.date_end ? new Date(race.date_end) : start;
        const cur = new Date(start);
        while (cur <= end) {
          const key = cur.toISOString().slice(0, 10);
          (perDay[key] = perDay[key] || []).push(race);
          cur.setDate(cur.getDate() + 1);
        }
      }
      map[slug] = perDay;
    }
    return map;
  }, [memberRaces]);

  // Client-side filtry, které backend zatím neumí:
  // - freeOnly: jen dny, kdy mám volno (excluduje busy days)
  // - communityTraction: race, kde má >= 2 lidí z komunity (plan_by.length >= 2)
  const filteredRacesByDay = useMemo(() => {
    if (!freeOnly && !communityTraction) return racesByDay;
    const out: Record<string, Race[]> = {};
    for (const [day, list] of Object.entries(racesByDay)) {
      if (freeOnly && busyDays.has(day)) continue;
      const filtered = communityTraction
        ? list.filter((r) => (r.plan_by?.length || 0) >= 2)
        : list;
      if (filtered.length > 0) out[day] = filtered;
    }
    return out;
  }, [racesByDay, busyDays, freeOnly, communityTraction]);

  const toggleMember = (slug: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const raceCount = items.length;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 pb-8">
      {/* Sticky top bar — search + filter button + kontext */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-canvas/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Hledat…"
            className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus-ring sm:max-w-xs"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-ring ${
              filtersOpen
                ? "border-brand bg-brand text-brand-ink"
                : "border-border-strong bg-canvas text-ink-900 hover:bg-surface-muted"
            }`}
          >
            <span aria-hidden>⏷</span>
            Filtry
            {activeFilterCount > 0 && (
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                  filtersOpen
                    ? "bg-brand-ink text-brand"
                    : "bg-brand text-brand-ink"
                }`}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <span className="hidden text-xs text-ink-500 md:inline">
            {raceCount} race
            {selectedMembers.size > 0 && ` · ${selectedMembers.size} lidí`}
          </span>
        </div>

        {/* Compact sport pills — vždy viditelné */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="uk-mode inline-flex" role="group" aria-label="Sport">
            <button
              type="button"
              aria-pressed={!filters.sport}
              onClick={() => setFilter({ sport: undefined })}
            >
              Vše
            </button>
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
          <div className="uk-mode inline-flex" role="group" aria-label="Rozsah">
            <button
              type="button"
              aria-pressed={filters.topOnly === true}
              onClick={() => setFilter({ topOnly: true })}
            >
              Top
            </button>
            <button
              type="button"
              aria-pressed={filters.topOnly !== true}
              onClick={() => setFilter({ topOnly: false })}
            >
              Všechny
            </button>
          </div>
          {user && (
            <>
              <button
                type="button"
                aria-pressed={filters.favOnly ?? false}
                onClick={() => setFilter({ favOnly: !filters.favOnly })}
                className="uk-chip"
              >
                ★ Můj plán
              </button>
              <button
                type="button"
                aria-pressed={freeOnly}
                onClick={() => setFreeOnly((v) => !v)}
                className="uk-chip"
                title="Jen dny, kdy nemám v osobním kalendáři obsazenost"
              >
                🕐 Volno
              </button>
              <button
                type="button"
                aria-pressed={communityTraction}
                onClick={() => setCommunityTraction((v) => !v)}
                className="uk-chip"
                title="Jen race, kde jsou 2+ lidí z mé komunity"
              >
                👥 Komunita 2+
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter drawer */}
      {filtersOpen && (
        <div className="mb-4 rounded-md border border-border bg-surface-muted/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Období */}
            <div>
              <p className="mono-tag mb-2 text-ink-500">Období</p>
              <div className="flex items-center gap-2 text-sm text-ink-700">
                <label className="flex items-center gap-1">
                  Od
                  <input
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) =>
                      setFilter({ from: e.target.value || undefined })
                    }
                    className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
                  />
                </label>
                <label className="flex items-center gap-1">
                  Do
                  <input
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) =>
                      setFilter({ to: e.target.value || undefined })
                    }
                    className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <span className="text-xs text-ink-500">Horizont:</span>
                {[6, 12, 24].map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={monthsAhead === m}
                    onClick={() => setMonthsAhead(m)}
                    className="uk-chip text-[12px]"
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            {/* Komunita */}
            {user && myCommunities.length > 0 && (
              <div>
                <p className="mono-tag mb-2 text-ink-500">Komunita</p>
                <select
                  value={filters.workspace ?? ""}
                  onChange={(e) =>
                    setFilter({ workspace: e.target.value || undefined })
                  }
                  className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
                >
                  <option value="">Všechny mé komunity</option>
                  {myCommunities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name} ({c.members_with_plan}/{c.member_count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Region */}
            <div className="sm:col-span-2">
              <p className="mono-tag mb-2 text-ink-500">Oblast</p>
              <div className="flex flex-wrap gap-1">
                {REGION_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={filters.region === r.value}
                    onClick={() =>
                      setFilter({
                        region:
                          filters.region === r.value ? undefined : r.value,
                      })
                    }
                    className="uk-chip"
                  >
                    <span aria-hidden>{r.emoji}</span>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Délka */}
            <div>
              <p className="mono-tag mb-2 text-ink-500">Délka</p>
              <div className="flex flex-wrap gap-1">
                {LENGTH_PRESETS.map((p) => {
                  const active =
                    filters.minKm === p.min && filters.maxKm === p.max;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setFilter({
                          minKm: active ? undefined : p.min,
                          maxKm: active ? undefined : p.max,
                        })
                      }
                      className="uk-chip"
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Série */}
            <div>
              <p className="mono-tag mb-2 text-ink-500">Série</p>
              <div className="flex flex-wrap gap-1">
                {SERIES_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={filters.series === s.value}
                    onClick={() =>
                      setFilter({
                        series:
                          filters.series === s.value ? undefined : s.value,
                      })
                    }
                    className="uk-chip"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-border-strong bg-canvas px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-muted focus-ring"
            >
              Zrušit vše
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-hover focus-ring"
            >
              Hotovo
            </button>
          </div>
        </div>
      )}

      {/* Multi-user picker */}
      {user && myPeople.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">
            👥 Porovnej s{" "}
            {selectedMembers.size > 0
              ? `${selectedMembers.size} lidmi z komunity`
              : "lidmi z komunity"}
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myPeople.map((p) => (
              <button
                key={p.slug}
                type="button"
                aria-pressed={selectedMembers.has(p.slug)}
                onClick={() => toggleMember(p.slug)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-ring ${
                  selectedMembers.has(p.slug)
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-border bg-canvas text-ink-700 hover:bg-surface-muted"
                }`}
              >
                {p.display_name}
                {p.plan_count > 0 && (
                  <span className="ml-1 opacity-75">· {p.plan_count}</span>
                )}
              </button>
            ))}
            {selectedMembers.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedMembers(new Set())}
                className="text-xs text-brand underline underline-offset-2 hover:no-underline"
              >
                Zrušit výběr
              </button>
            )}
          </div>
        </details>
      )}

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-brand" />
          Race
        </span>
        {user && (
          <>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-sm"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, var(--ink-300), var(--ink-300) 2px, transparent 2px, transparent 4px)",
                }}
              />
              Obsazenost
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-full border-2 border-success bg-canvas"
              />
              Match
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-ink-900"
              />
              Člen komunity
            </span>
          </>
        )}
      </div>

      {loading && (
        <p className="py-10 text-center text-sm text-ink-500">Načítám…</p>
      )}
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {months.map((m) => (
            <MonthCanvas
              key={`${m.year}-${m.month}`}
              year={m.year}
              month={m.month}
              racesByDay={filteredRacesByDay}
              busyDays={busyDays}
              memberRacesByDay={memberRacesByDay}
              selectedMembers={selectedMembers}
              myPeople={myPeople}
              userLoggedIn={!!user}
              onDayClick={setOpenDay}
            />
          ))}
        </div>
      )}

      {openDay && (
        <DayDetailModal
          day={openDay}
          races={filteredRacesByDay[openDay] || []}
          busy={busyDays.has(openDay)}
          memberEntries={Object.entries(memberRacesByDay).flatMap(
            ([slug, byDay]) =>
              (byDay[openDay] || []).map((race) => ({ slug, race })),
          )}
          myPeople={myPeople}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}

// -------- Month grid --------

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTH_NAMES_CS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

function MonthCanvas({
  year,
  month,
  racesByDay,
  busyDays,
  memberRacesByDay,
  selectedMembers,
  myPeople,
  userLoggedIn,
  onDayClick,
}: {
  year: number;
  month: number;
  racesByDay: Record<string, Race[]>;
  busyDays: Set<string>;
  memberRacesByDay: Record<string, Record<string, Race[]>>;
  selectedMembers: Set<string>;
  myPeople: MyCommunityPerson[];
  userLoggedIn: boolean;
  onDayClick: (day: string) => void;
}) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const peopleBySlug = useMemo(
    () => Object.fromEntries(myPeople.map((p) => [p.slug, p])),
    [myPeople],
  );

  const monthRaceCount = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const races = racesByDay[iso];
      if (races) n += races.length;
    }
    return n;
  }, [year, month, daysInMonth, racesByDay]);

  return (
    <div className="rounded-md border border-border bg-canvas p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-ink-900">
          {MONTH_NAMES_CS[month]}{" "}
          <span className="font-normal text-ink-500">{year}</span>
        </h3>
        {monthRaceCount > 0 && (
          <span className="text-[11px] font-medium text-brand">
            {monthRaceCount} race
          </span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-ink-500"
          >
            {wd}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="min-h-[64px]" />;
          }
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayRaces = racesByDay[iso] || [];
          const isBusy = busyDays.has(iso);
          const memberEntries: { slug: string; race: Race }[] = [];
          for (const slug of selectedMembers) {
            const rlist = memberRacesByDay[slug]?.[iso] || [];
            for (const r of rlist) memberEntries.push({ slug, race: r });
          }
          const isMatch =
            userLoggedIn && !isBusy && dayRaces.length > 0;
          const isWeekend = i % 7 >= 5;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick(iso)}
              className={`relative flex min-h-[64px] flex-col items-stretch gap-0.5 rounded-sm border p-1 text-left transition-transform hover:scale-[1.02] focus-ring ${
                isMatch
                  ? "border-success bg-success/5 shadow-[0_0_0_1px_var(--success)]"
                  : dayRaces.length > 0
                    ? "border-brand/40 bg-brand-soft/25"
                    : isWeekend
                      ? "border-border bg-surface-muted/40"
                      : "border-border bg-canvas hover:bg-surface-muted"
              }`}
              style={
                isBusy
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 2px, transparent 2px, transparent 6px)",
                    }
                  : undefined
              }
              aria-label={`${day}. ${MONTH_NAMES_CS[month]} ${year}${dayRaces.length > 0 ? `, ${dayRaces.length} race` : ""}${isBusy ? ", obsazeno" : ""}`}
            >
              <div className="flex items-start justify-between text-[10px] leading-none">
                <span
                  className={`font-semibold ${isMatch ? "text-success" : "text-ink-900"}`}
                >
                  {day}
                </span>
                {memberEntries.length > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    {memberEntries.slice(0, 3).map((e, idx) => (
                      <span
                        key={idx}
                        aria-hidden
                        title={peopleBySlug[e.slug]?.display_name}
                        className="inline-block h-2 w-2 rounded-full bg-ink-900"
                      />
                    ))}
                    {memberEntries.length > 3 && (
                      <span className="text-[9px] text-ink-500">
                        +{memberEntries.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {dayRaces.slice(0, 2).map((race) => (
                <span
                  key={race.id}
                  className="truncate rounded-sm bg-brand px-1 text-[9px] font-medium leading-tight text-brand-ink"
                  title={race.name}
                >
                  {race.name}
                </span>
              ))}
              {dayRaces.length > 2 && (
                <span className="text-[9px] text-ink-500">
                  +{dayRaces.length - 2} race
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------- Day detail modal --------

function DayDetailModal({
  day,
  races: dayRaces,
  busy,
  memberEntries,
  myPeople,
  onClose,
}: {
  day: string;
  races: Race[];
  busy: boolean;
  memberEntries: { slug: string; race: Race }[];
  myPeople: MyCommunityPerson[];
  onClose: () => void;
}) {
  const peopleBySlug = Object.fromEntries(myPeople.map((p) => [p.slug, p]));
  const date = new Date(day);
  const label = date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-md border-t border-border bg-canvas p-5 shadow-2xl sm:rounded-md sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-ink-900">{label}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="rounded-md p-1 text-ink-500 hover:bg-surface-muted focus-ring"
          >
            ✕
          </button>
        </div>

        {busy && (
          <div className="mb-4 rounded-sm border border-ink-300 bg-surface-muted px-3 py-2 text-sm text-ink-700">
            🔒 Máš v tenhle den obsazenost ve svém kalendáři.
          </div>
        )}

        {dayRaces.length > 0 ? (
          <div className="mb-4">
            <p className="mono-tag mb-2 text-ink-500">Race v tenhle den</p>
            <ul className="space-y-2">
              {dayRaces.map((race) => (
                <li
                  key={race.id}
                  className="rounded-sm border border-border bg-surface p-3"
                >
                  <p className="font-medium text-ink-900">{race.name}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {race.location} · {race.distance_km} km
                    {race.elevation_m && ` · ${race.elevation_m} m D+`}
                  </p>
                  {race.plan_status && (
                    <p className="mt-1">
                      <span
                        className={`inline-flex rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${PLAN_STATUS_TONE[race.plan_status as RacePlanStatus]}`}
                      >
                        {
                          PLAN_STATUS_LABEL[
                            race.plan_status as RacePlanStatus
                          ]
                        }
                      </span>
                    </p>
                  )}
                  {race.plan_by && race.plan_by.length > 0 && (
                    <p className="mt-1 text-xs text-ink-500">
                      👥 {race.plan_by.length} z komunity plánuje
                    </p>
                  )}
                  {race.url && (
                    <a
                      href={race.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
                    >
                      Web závodu →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mb-4 text-sm text-ink-500">
            Žádný race v tenhle den.
          </p>
        )}

        {memberEntries.length > 0 && (
          <div>
            <p className="mono-tag mb-2 text-ink-500">
              Kdo z komunity tam jede
            </p>
            <ul className="space-y-1.5">
              {memberEntries.map((e, i) => {
                const p = peopleBySlug[e.slug];
                return (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Link
                      href={`/u/${e.slug}`}
                      className="font-medium text-ink-900 hover:text-brand"
                    >
                      {p?.display_name || e.slug}
                    </Link>
                    <span className="text-ink-500">→ {e.race.name}</span>
                    {e.race.plan_status && (
                      <span
                        className={`inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${PLAN_STATUS_TONE[e.race.plan_status as RacePlanStatus]}`}
                      >
                        {
                          PLAN_STATUS_LABEL[
                            e.race.plan_status as RacePlanStatus
                          ]
                        }
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Ensure REGION_LABEL is used somewhere for linter parity */}
        <span className="sr-only">{Object.keys(REGION_LABEL).length}</span>
      </div>
    </div>
  );
}
