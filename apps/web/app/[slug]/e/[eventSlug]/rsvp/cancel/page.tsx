"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { ApiError, events } from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

/**
 * Cancel page pro guest RSVP — anon registrant klikne v confirmation
 * mailu na "Zrušit registraci", `?token=` v URL je magic link bez auth.
 * Stránka napřed GET-ne info o RSVP a ukáže potvrzovací prompt; klik
 * na "Zrušit registraci" pošle POST, který Backend zpracuje + vrátí
 * stav. Idempotentní — opakovaná návštěva s tím samým tokenem zobrazí
 * "Registrace už byla zrušena".
 */
export default function RsvpCancelPage({ params }: Props) {
  const { slug, eventSlug } = use(params);
  return (
    <Suspense fallback={null}>
      <CancelInner workspaceSlug={slug} eventSlug={eventSlug} />
    </Suspense>
  );
}

function CancelInner({
  workspaceSlug,
  eventSlug,
}: {
  workspaceSlug: string;
  eventSlug: string;
}) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{
    event_title: string;
    workspace_name: string;
    status: string;
    user_name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      setError("Chybí token v URL.");
      return;
    }
    (async () => {
      try {
        const r = await events.rsvpCancelInfoByToken(token);
        if (cancelled) return;
        setInfo(r);
        // Pokud RSVP už cancelled, ukážeme to rovnou — žádný další POST
        // není potřeba (idempotentní).
        if (r.status === "cancelled") setDone(true);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Tento odkaz už neplatí — registrace neexistuje nebo byla smazána."
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

  async function handleCancel() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await events.rsvpCancelByToken(token);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Zrušení selhalo. Zkus to prosím znovu.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (error && !info) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Odkaz neplatí
          </h1>
          <p className="mt-3 text-ink-700">{error}</p>
          <LinkButton
            href={`/${workspaceSlug}/e/${eventSlug}`}
            variant="primary"
            size="md"
            className="mt-6"
          >
            Zpět na akci
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
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Registrace zrušena
          </h1>
          <p className="mt-3 text-ink-700">
            Sundali jsme tě z akce <strong>{info.event_title}</strong>.
            Pokud chceš dorazit přece jen, můžeš se znovu přihlásit ze
            stránky akce.
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <LinkButton
            href={`/${workspaceSlug}/e/${eventSlug}`}
            variant="primary"
            size="lg"
          >
            Stránka akce →
          </LinkButton>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-brand">Zrušení registrace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          {info.event_title}
        </h1>
        {info.user_name && (
          <p className="mt-2 text-sm text-ink-500">{info.user_name}</p>
        )}
        <p className="mt-6 text-ink-700">
          Opravdu chceš zrušit svojí registraci na tuhle akci? Pokud byla
          potvrzená, posuneme dalšího člověka z waitlistu.
        </p>
        {error && (
          <div className="mt-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="danger"
            size="lg"
            onClick={handleCancel}
            loading={submitting}
          >
            Zrušit registraci
          </Button>
          <LinkButton
            href={`/${workspaceSlug}/e/${eventSlug}`}
            variant="secondary"
            size="lg"
          >
            Nechat to být
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
