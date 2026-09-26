"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  races,
  type PublicRacePlanResponse,
  type RacePlanEntry,
  type RacePlanStatus,
} from "@/lib/races";

/**
 * Race plan section pro `/u/<slug>` public profile.
 *
 * Zobrazí veřejný race plán uživatele (závody, které si přidal + status:
 * Zajímá mě / Čekám na registraci / Registrován / Waitlist / Absolvoval).
 * Umožňuje filtrování per year + per status. URL query params jsou
 * shareable — např. `/u/olaf?year=2027&status=registered`.
 *
 * Anon viewer vidí vše; do budoucna per-entry visibility toggle.
 */
export function RacePlanSection({ userSlug }: { userSlug: string }) {
  const [data, setData] = useState<PublicRacePlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<RacePlanStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    races
      .publicPlan(userSlug, {
        year: yearFilter ?? undefined,
        status: statusFilter ?? undefined,
      })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setError("Načtení plánu selhalo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userSlug, yearFilter, statusFilter]);

  // Odvození dostupných roků + statusů z aktuálních dat.
  const availableYears = data
    ? Array.from(
        new Set(data.results.map((e) => e.race.next_year).filter(Boolean)),
      ).sort()
    : [];
  const availableStatuses = data
    ? Array.from(new Set(data.results.map((e) => e.status)))
    : [];

  // Grouping podle roku pokud není year filter aktivní.
  const grouped = data
    ? groupByYear(data.results)
    : new Map<number, RacePlanEntry[]>();

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink-900">Race plán</h2>
        {data && data.count > 0 && (
          <span className="text-sm text-ink-500">
            {data.count} závodů
          </span>
        )}
      </div>

      {/* Filtry — Rok chips + Status chips */}
      {data && data.count > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {availableYears.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Rok
              </span>
              <FilterChip
                label="Vše"
                active={yearFilter === null}
                onClick={() => setYearFilter(null)}
              />
              {availableYears.map((y) => (
                <FilterChip
                  key={y}
                  label={String(y)}
                  active={yearFilter === y}
                  onClick={() => setYearFilter(y)}
                />
              ))}
            </div>
          )}
          {availableStatuses.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                Status
              </span>
              <FilterChip
                label="Vše"
                active={statusFilter === null}
                onClick={() => setStatusFilter(null)}
              />
              {availableStatuses.map((s) => (
                <FilterChip
                  key={s}
                  label={PLAN_STATUS_LABEL[s]}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-6 flex justify-center py-8">
          <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger-soft/40 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && data && data.count === 0 && (
        <p className="mt-6 rounded-md border border-dashed border-border bg-surface/60 p-6 text-center text-sm text-ink-500">
          {yearFilter || statusFilter
            ? "S tímhle filtrem nic není. Zruš filtry pro celý plán."
            : "Prázdný plán — zatím žádný závod v hledáčku."}
        </p>
      )}

      {!loading && !error && data && data.count > 0 && (
        <div className="mt-6 flex flex-col gap-6">
          {yearFilter !== null
            ? // Filtrováno na 1 rok — plochý seznam
              renderEntries(data.results)
            : // Groupováno podle roku (reverse sort — nejnovější dole)
              [...grouped.entries()]
                .sort(([a], [b]) => a - b)
                .map(([year, entries]) => (
                  <div key={year}>
                    <h3
                      className="mb-3 border-b border-border pb-2 font-semibold text-ink-900"
                      style={{ fontSize: "clamp(18px, 2vw, 22px)" }}
                    >
                      {year}
                    </h3>
                    {renderEntries(entries)}
                  </div>
                ))}
        </div>
      )}

      {data && data.count > 0 && (
        <p className="mt-6 text-xs text-ink-500">
          → Chceš si vytvořit vlastní plán?{" "}
          <Link
            href="/kalendar"
            className="font-medium text-brand hover:underline"
          >
            Otevři kalendář závodů
          </Link>
        </p>
      )}
    </section>
  );
}

function renderEntries(entries: RacePlanEntry[]) {
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <RaceEntryCard key={e.race.id} entry={e} />
      ))}
    </div>
  );
}

function RaceEntryCard({ entry }: { entry: RacePlanEntry }) {
  const { race, status, note } = entry;
  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 transition-colors hover:border-ink-500 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {race.url ? (
            <a
              href={race.url}
              target="_blank"
              rel="noreferrer"
              className="text-base font-semibold text-ink-900 hover:text-brand hover:underline"
            >
              {race.name}
            </a>
          ) : (
            <span className="text-base font-semibold text-ink-900">
              {race.name}
            </span>
          )}
          {race.is_top && (
            <span
              className="inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-ink"
              style={{ background: "var(--brand)" }}
            >
              TOP
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-500">
          {[
            race.next_label || race.date_display,
            race.next_year,
            race.location || race.country,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          {race.distance_km} km
          {race.elevation_m
            ? ` · ${race.elevation_m.toLocaleString("cs-CZ")} m D+`
            : ""}
          {race.terrain ? ` · ${race.terrain}` : ""}
        </p>
        {note && (
          <p className="mt-2 rounded-sm border-l-2 border-brand bg-brand/5 px-2 py-1 text-sm text-ink-700">
            {note}
          </p>
        )}
      </div>
      <span
        className={`inline-flex shrink-0 items-center rounded-sm px-2 py-1 text-xs font-semibold uppercase tracking-wider ${PLAN_STATUS_TONE[status]}`}
      >
        {PLAN_STATUS_LABEL[status]}
      </span>
    </article>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12.5px] transition-colors focus-ring ${
        active
          ? "border-ink-900 bg-ink-900 text-canvas"
          : "border-border bg-canvas text-ink-700 hover:border-ink-500"
      }`}
    >
      {label}
    </button>
  );
}

function groupByYear(
  entries: RacePlanEntry[],
): Map<number, RacePlanEntry[]> {
  const m = new Map<number, RacePlanEntry[]>();
  for (const e of entries) {
    const y = e.race.next_year || new Date(e.race.date_start).getUTCFullYear();
    const arr = m.get(y) ?? [];
    arr.push(e);
    m.set(y, arr);
  }
  return m;
}
