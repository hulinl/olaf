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
 * odpověď má rating, dvě volitelná free-text pole, jméno + e-mail
 * respondenta (snapshot v okamžiku submitu).
 */
export default function EventFeedbackListPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
          Rozešli žádost o zpětnou vazbu z cockpitu akce a odpovědi se
          objeví tady.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-ink-900">
                    {r.name || r.email}
                  </span>
                  {r.name && (
                    <span className="text-xs text-ink-500">{r.email}</span>
                  )}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-semibold text-ink-900">
                    {r.rating}
                    <span className="text-sm text-ink-500">/5</span>
                  </span>
                  <span className="text-xs text-ink-500">
                    {new Date(r.updated_at).toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              {r.went_well && (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-ink-500">
                    Co se povedlo
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">
                    {r.went_well}
                  </p>
                </div>
              )}
              {r.could_improve && (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-ink-500">
                    Co příště jinak
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">
                    {r.could_improve}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
