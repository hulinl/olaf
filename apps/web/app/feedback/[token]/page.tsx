"use client";

import { use, useEffect, useState } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ApiError, events } from "@/lib/api";

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Public post-event feedback stránka. Magic-link z e-mailu → token
 * v URL identifikuje RSVP. Bez loginu — form submit posílá jen rating
 * + 2 free-text pole; snapshot jméno + e-mail se ukládá backendem.
 *
 * Upsert: pokud už user jednou vyplnil, form přednatáhne hodnoty a
 * druhý submit přepíše (žádné duplicity).
 */
export default function FeedbackPage({ params }: Props) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{
    event_title: string;
    event_starts_at: string;
    event_ends_at: string;
    event_location: string;
  } | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [wentWell, setWentWell] = useState("");
  const [couldImprove, setCouldImprove] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await events.feedbackInfoByToken(token);
        if (cancelled) return;
        setInfo({
          event_title: r.event_title,
          event_starts_at: r.event_starts_at,
          event_ends_at: r.event_ends_at,
          event_location: r.event_location,
        });
        if (r.existing) {
          setRating(r.existing.rating);
          setWentWell(r.existing.went_well);
          setCouldImprove(r.existing.could_improve);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "Tento odkaz už neplatí — buď je špatně zkopírovaný, nebo registrace byla mezitím smazaná."
            : err instanceof ApiError
              ? err.firstFieldError() ?? err.message
              : "Něco se pokazilo, zkus to prosím znovu.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || rating === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await events.submitFeedbackByToken(token, {
        rating,
        went_well: wentWell.trim(),
        could_improve: couldImprove.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení selhalo, zkus to prosím znovu.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center py-20">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Odkaz neplatí
          </h1>
          <p className="mt-3 text-ink-700">{loadError}</p>
          <LinkButton href="/" variant="primary" size="md" className="mt-6">
            Zpět na Olaf
          </LinkButton>
        </div>
      </main>
    );
  }

  if (!info) return null;

  if (done) {
    return (
      <main className="flex flex-1 flex-col items-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <p className="text-sm font-medium text-brand">Díky!</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            Zpětná vazba odeslána
          </h1>
          <p className="mt-3 text-ink-700">
            Díky, že sis udělal/a čas — pomůže nám to udělat další akce
            ještě lepší. Chceš něco přidat? Formulář se ti opět otevře,
            kdykoli klikneš na ten samý odkaz z mailu.
          </p>
          <LinkButton href="/" variant="secondary" size="md" className="mt-6">
            Zpět na Olaf
          </LinkButton>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl">
        <p className="text-sm font-medium text-brand">Zpětná vazba k akci</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          {info.event_title}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {formatEventRange(info.event_starts_at, info.event_ends_at)}
          {info.event_location && <span> · {info.event_location}</span>}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <Field
            label="Jak celkově hodnotíš akci?"
            hint="1 = mizerné, 5 = paráda"
          >
            <StarRating value={rating} onChange={setRating} />
          </Field>

          <Field label="Co se povedlo?" htmlFor="went-well">
            <textarea
              id="went-well"
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Volitelné — cokoli, co ti zůstalo v hlavě jako win."
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-ink-300 focus-ring transition-colors duration-150"
            />
          </Field>

          <Field label="Co bys příště udělal/a jinak?" htmlFor="could-improve">
            <textarea
              id="could-improve"
              value={couldImprove}
              onChange={(e) => setCouldImprove(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Volitelné — konkrétní věci, kterými bysme mohli akci vylepšit."
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-ink-300 focus-ring transition-colors duration-150"
            />
          </Field>

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-500">
              Odpověď spojujeme s registrací — organizátor uvidí jméno a e-mail.
            </p>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              disabled={rating === null || submitting}
            >
              Odeslat
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function formatEventRange(startsIso: string, endsIso: string): string {
  const s = new Date(startsIso);
  const e = new Date(endsIso);
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return s.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  const startFmt = s.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
  });
  const endFmt = e.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startFmt} – ${endFmt}`;
}

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Hodnocení"
      className="flex flex-wrap gap-2"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={[
              "inline-flex h-12 w-12 items-center justify-center rounded-md border text-lg font-semibold transition-colors focus-ring",
              active
                ? "border-brand bg-brand/15 text-ink-900"
                : "border-border bg-surface text-ink-500 hover:bg-surface-muted",
            ].join(" ")}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
