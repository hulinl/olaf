"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, auth, personalCalendar, type User } from "@/lib/api";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  races,
  type MyCommunity,
  type MyCommunityPerson,
  type Race,
  type RacePlanStatus,
} from "@/lib/races";

/**
 * Časová osa canvas — Slice 5 vize „community awareness".
 *
 * Vertikální stack měsíců (12 od dneška), každý den kostička.
 * Overlay vrstvy:
 * - Race events z /api/races/ (podle filtru sport + komunita)
 * - Osobní obsazenost z /api/personal-calendar/busy-days/ (šrafovaný pattern)
 * - Vybraní členové komunity — jejich race účast jako avatar dots
 * - Match highlight: den je free + je tam race = amber glow ring
 *
 * Design: mobile-first, single column měsíců. Na desktopu 2 měsíce
 * vedle sebe (přes CSS grid). Klik na den = drawer s detaily.
 */
export function TimelineCanvasClient() {
  const [user, setUser] = useState<User | null>(null);
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
  const [sport, setSport] = useState<"trail" | "skialp" | "">("trail");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("");
  const [topOnly, setTopOnly] = useState(true);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    void auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = new Date();
    const fromISO = today.toISOString().slice(0, 10);
    const to = new Date(today);
    to.setFullYear(to.getFullYear() + 1);
    const toISO = to.toISOString().slice(0, 10);

    try {
      const promises: Promise<unknown>[] = [
        races.list({
          from: fromISO,
          to: toISO,
          sport: sport || undefined,
          topOnly: topOnly || undefined,
          workspace: workspaceFilter || undefined,
        }),
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
  }, [user, sport, topOnly, workspaceFilter]);

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

  // 12 měsíců od aktuálního
  const months = useMemo(() => {
    const now = new Date();
    const list: { year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      list.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return list;
  }, []);

  // Index race po dnech pro rychlý lookup
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

  // Index member races: person_slug → day → race[]
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

  const toggleMember = (slug: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="uk-mode inline-flex" role="group" aria-label="Sport">
            <button
              type="button"
              aria-pressed={sport === ""}
              onClick={() => setSport("")}
            >
              Vše
            </button>
            <button
              type="button"
              aria-pressed={sport === "trail"}
              onClick={() => setSport("trail")}
            >
              Běh
            </button>
            <button
              type="button"
              aria-pressed={sport === "skialp"}
              onClick={() => setSport("skialp")}
            >
              Skialp
            </button>
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={topOnly}
              onChange={(e) => setTopOnly(e.target.checked)}
            />
            Top výběr
          </label>
          {user && myCommunities.length > 0 && (
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
            >
              <option value="">Všechny mé komunity</option>
              {myCommunities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-sm bg-brand"
              />
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
                  Match (volno + race)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Member selector */}
        {user && myPeople.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-700">
              Porovnej s{" "}
              {selectedMembers.size > 0
                ? `(${selectedMembers.size} lidí)`
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
            </div>
          </details>
        )}
      </div>

      {loading && (
        <p className="py-10 text-center text-sm text-ink-500">Načítám…</p>
      )}
      {error && (
        <p className="py-10 text-center text-sm text-danger">{error}</p>
      )}

      {!loading && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          {months.map((m) => (
            <MonthCanvas
              key={`${m.year}-${m.month}`}
              year={m.year}
              month={m.month}
              racesByDay={racesByDay}
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
          races={racesByDay[openDay] || []}
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
  // Mon=0, Sun=6 layout
  const startWeekday = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const peopleBySlug = useMemo(
    () => Object.fromEntries(myPeople.map((p) => [p.slug, p])),
    [myPeople],
  );

  return (
    <div className="rounded-md border border-border bg-canvas p-3">
      <h3 className="mb-2 text-base font-semibold text-ink-900">
        {MONTH_NAMES_CS[month]} {year}
      </h3>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="pb-1 text-center text-[10px] font-medium uppercase text-ink-500"
          >
            {wd}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="min-h-[70px]" />;
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
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick(iso)}
              className={`relative flex min-h-[70px] flex-col items-stretch gap-0.5 rounded-sm border p-1 text-left transition-colors focus-ring ${
                isMatch
                  ? "border-success bg-success/5"
                  : dayRaces.length > 0
                    ? "border-brand/40 bg-brand-soft/25"
                    : "border-border bg-canvas hover:bg-surface-muted"
              }`}
              style={
                isBusy
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(45deg, var(--ink-300), var(--ink-300) 2px, transparent 2px, transparent 6px)",
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between text-[10px] leading-none">
                <span
                  className={`font-semibold ${isMatch ? "text-success" : "text-ink-900"}`}
                >
                  {day}
                </span>
                {memberEntries.length > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    {memberEntries.slice(0, 3).map((e, idx) => {
                      const person = peopleBySlug[e.slug];
                      return (
                        <span
                          key={idx}
                          aria-hidden
                          title={person?.display_name}
                          className="inline-block h-2 w-2 rounded-full bg-ink-900"
                        />
                      );
                    })}
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
                  className="truncate rounded-sm bg-brand px-0.5 text-[9px] font-medium leading-tight text-brand-ink"
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
        className="w-full max-w-md rounded-t-md border-t border-border bg-canvas p-5 shadow-2xl sm:rounded-md sm:border"
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
                        {PLAN_STATUS_LABEL[race.plan_status as RacePlanStatus]}
                      </span>
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
                        {PLAN_STATUS_LABEL[e.race.plan_status as RacePlanStatus]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
