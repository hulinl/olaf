"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import { ApiError, auth, events, type Event as OlafEvent } from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

type FeedbackRow = Awaited<ReturnType<typeof events.listFeedback>>[number];

/**
 * Owner-only list zpětných vazeb k akci. Nejnovější první; každá
 * odpověď má rating + dvě volitelná free-text pole, jméno + e-mail
 * respondenta. Řádky jsou default collapsed (jen rating + jméno), klik
 * expanduje detail — potřeba když se někdo rozepíše a list roste.
 * CSV export pro follow-up práci mimo app (Excel, AI).
 */
export default function EventFeedbackListPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ev = await events.publicEvent(wsSlug, eventSlug);
        if (cancelled) return;
        if (!ev.i_am_owner) {
          try {
            await auth.me();
            router.replace(`/${wsSlug}/e/${eventSlug}`);
          } catch {
            router.replace(
              `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/zpetne-vazby`,
            );
          }
          return;
        }
        setEvent(ev);
        const list = await events.listFeedback(wsSlug, eventSlug);
        if (cancelled) return;
        setRows(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/zpetne-vazby`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/eventy");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wsSlug, eventSlug, router]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!event || rows === null) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  const avg =
    rows.length > 0
      ? rows.reduce((a, r) => a + r.rating, 0) / rows.length
      : null;

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/eventy/${wsSlug}/${eventSlug}/edit`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na cockpit akce
      </Link>

      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-brand">Zpětná vazba</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          {event.title}
        </h1>
        <p className="text-sm text-ink-500">
          {rows.length === 0 ? (
            "Zatím nikdo neodpověděl."
          ) : (
            <>
              {rows.length} odpověd{rows.length === 1 ? "" : rows.length < 5 ? "i" : "í"}
              {avg !== null && (
                <>
                  {" "}
                  · průměr <strong className="text-ink-900">{avg.toFixed(1)}</strong>/5
                </>
              )}
            </>
          )}
        </p>
      </header>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/events/${wsSlug}/${eventSlug}/feedback.csv`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
          >
            ↓ Stáhnout CSV
          </a>
          <button
            type="button"
            onClick={() =>
              setExpanded(
                expanded.size === rows.length
                  ? new Set()
                  : new Set(rows.map((r) => r.id)),
              )
            }
            className="text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            {expanded.size === rows.length
              ? "Sbalit vše"
              : "Rozbalit vše"}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
          Rozešli žádost o zpětnou vazbu z cockpitu akce a odpovědi se
          objeví tady.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            const hasDetail = !!(r.went_well || r.could_improve);
            return (
              <li
                key={r.id}
                className="rounded-md border border-border bg-surface"
              >
                <button
                  type="button"
                  onClick={() => hasDetail && toggle(r.id)}
                  className={[
                    "flex w-full flex-wrap items-baseline justify-between gap-2 rounded-md px-4 py-3 text-left",
                    hasDetail
                      ? "hover:bg-surface-muted/40 focus-ring cursor-pointer"
                      : "cursor-default",
                  ].join(" ")}
                  aria-expanded={hasDetail ? isOpen : undefined}
                  disabled={!hasDetail}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-lg font-semibold text-ink-900 tabular-nums">
                      {r.rating}
                      <span className="text-sm text-ink-500">/5</span>
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-ink-900">
                        {r.name || r.email}
                      </span>
                      {r.name && (
                        <span className="text-xs text-ink-500">{r.email}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-500">
                      {new Date(r.updated_at).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {hasDetail && (
                      <span
                        aria-hidden="true"
                        className="text-ink-500 transition-transform"
                        style={{
                          transform: isOpen ? "rotate(90deg)" : "rotate(0)",
                        }}
                      >
                        ›
                      </span>
                    )}
                  </div>
                </button>

                {hasDetail && isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    {r.went_well && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-ink-500">
                          Co se povedlo
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">
                          {r.went_well}
                        </p>
                      </div>
                    )}
                    {r.could_improve && (
                      <div className={r.went_well ? "mt-3" : ""}>
                        <p className="text-xs uppercase tracking-wide text-ink-500">
                          Co příště jinak
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">
                          {r.could_improve}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
