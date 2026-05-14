"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type RSVPRecord,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

type Filter = "all" | "yes" | "waitlist" | "pending_approval";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "pending_approval", label: "Čeká na schválení" },
  { value: "yes", label: "Potvrzeno" },
  { value: "waitlist", label: "Waitlist" },
];

const STATUS_LABELS: Record<RSVPRecord["status"], string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítnuto",
  waitlist: "Waitlist",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

const STATUS_TONE: Record<RSVPRecord["status"], string> = {
  yes: "bg-success/15 text-success",
  maybe: "bg-surface-muted text-ink-700",
  no: "bg-surface-muted text-ink-500",
  waitlist: "bg-warning/15 text-warning",
  pending_approval: "bg-brand-soft text-brand-active",
  cancelled: "bg-danger-soft text-danger",
};

export default function RSVPAdminPage({ params }: Props) {
  const { slug, eventSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [rsvps, setRsvps] = useState<RSVPRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev, list] = await Promise.all([
          workspaces.detail(slug),
          events.publicEvent(slug, eventSlug),
          events.rsvpList(slug, eventSlug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/${slug}/e/${eventSlug}`);
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
        setRsvps(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/communities/${slug}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, eventSlug, router]);

  const filtered = useMemo(() => {
    if (filter === "all") return rsvps;
    return rsvps.filter((r) => r.status === filter);
  }, [rsvps, filter]);

  const counts = useMemo(() => {
    const c: Record<RSVPRecord["status"], number> = {
      yes: 0, maybe: 0, no: 0,
      waitlist: 0, pending_approval: 0, cancelled: 0,
    };
    for (const r of rsvps) c[r.status]++;
    return c;
  }, [rsvps]);

  async function handleApprove(rsvp: RSVPRecord) {
    setActing(rsvp.id);
    try {
      const updated = await events.approveRsvp(slug, eventSlug, rsvp.id);
      setRsvps((prev) => prev.map((r) => (r.id === rsvp.id ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Schválení selhalo.");
    } finally {
      setActing(null);
    }
  }

  async function handleReject(rsvp: RSVPRecord) {
    if (!confirm(`Opravdu zamítnout přihlášku od ${rsvp.user_full_name}?`)) {
      return;
    }
    setActing(rsvp.id);
    try {
      const updated = await events.rejectRsvp(slug, eventSlug, rsvp.id);
      setRsvps((prev) => prev.map((r) => (r.id === rsvp.id ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zamítnutí selhalo.");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (!workspace || !event) return null;

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <p className="text-sm text-ink-500">
          <Link
            href={`/communities/${slug}`}
            className="hover:text-ink-900"
          >
            ← {workspace.name}
          </Link>
        </p>

        <header className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand">Přihlášení</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
              {event.title}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {counts.yes} potvrzeno
              {event.capacity != null && ` / ${event.capacity}`}
              {counts.waitlist > 0 && ` · ${counts.waitlist} waitlist`}
              {counts.pending_approval > 0 &&
                ` · ${counts.pending_approval} čeká na schválení`}
            </p>
          </div>
          <div className="flex gap-2">
            <LinkButton
              href={`/${slug}/e/${eventSlug}`}
              variant="secondary"
              size="md"
            >
              Veřejná stránka
            </LinkButton>
            <LinkButton
              href={`/communities/${slug}/events/${eventSlug}/edit`}
              variant="ghost"
              size="md"
            >
              Upravit akci
            </LinkButton>
          </div>
        </header>

        {error && (
          <div className="mb-6">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        <nav className="mb-6 flex flex-wrap gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={[
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
                filter === f.value
                  ? "bg-ink-900 text-ink-inverse"
                  : "bg-surface text-ink-700 border border-border hover:bg-surface-muted",
              ].join(" ")}
            >
              {f.label}
              {f.value !== "all" && counts[f.value] > 0 && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({counts[f.value]})
                </span>
              )}
            </button>
          ))}
        </nav>

        {filtered.length === 0 ? (
          <Card>
            <CardSection>
              <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                <h2 className="text-base font-semibold text-ink-900">
                  Žádné přihlášky v této kategorii
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Změň filtr nebo počkej, až někdo dorazí.
                </p>
              </div>
            </CardSection>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {filtered.map((rsvp) => (
                <li key={rsvp.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-base font-semibold text-ink-900">
                          {rsvp.user_full_name}
                        </p>
                        <span
                          className={[
                            "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                            STATUS_TONE[rsvp.status],
                          ].join(" ")}
                        >
                          {STATUS_LABELS[rsvp.status]}
                          {rsvp.status === "waitlist" &&
                            rsvp.waitlist_position != null &&
                            ` #${rsvp.waitlist_position}`}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-700">
                        <a
                          href={`mailto:${rsvp.user_email}`}
                          className="hover:underline"
                        >
                          {rsvp.user_email}
                        </a>
                        {rsvp.user_phone && (
                          <>
                            {" · "}
                            <a
                              href={`tel:${rsvp.user_phone}`}
                              className="hover:underline"
                            >
                              {rsvp.user_phone}
                            </a>
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Přihlášeno{" "}
                        {new Date(rsvp.created_at).toLocaleDateString("cs-CZ", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {rsvp.status === "pending_approval" && (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            loading={acting === rsvp.id}
                            onClick={() => handleApprove(rsvp)}
                          >
                            Schválit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            disabled={acting === rsvp.id}
                            onClick={() => handleReject(rsvp)}
                          >
                            Zamítnout
                          </Button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(expanded === rsvp.id ? null : rsvp.id)
                        }
                        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-muted focus-ring"
                      >
                        {expanded === rsvp.id ? "Skrýt" : "Detail"}
                      </button>
                    </div>
                  </div>

                  {expanded === rsvp.id && (
                    <AnswerDetail answers={rsvp.questionnaire_answers} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}

function AnswerDetail({
  answers,
}: {
  answers: RSVPRecord["questionnaire_answers"];
}) {
  const a = answers as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "boolean") {
      rows.push({ label, value: value ? "Ano" : "Ne" });
    } else {
      rows.push({ label, value: String(value) });
    }
  };

  push("Velikost trika", a.tshirt_size);
  push("Strava", a.diet);
  push("Alergie / poznámka", a.diet_note);
  push("Fitness level", a.fitness_level);
  push("10K time", a.pace_10k);
  push("Týdenní km", a.weekly_km);
  push("Nejdelší běh", a.longest_run);
  push("Fitness poznámka", a.fitness_note);
  push("Zdravotní poznámky", a.health_notes);
  push("Emergency jméno", a.emergency_contact_name);
  push("Emergency telefon", a.emergency_contact_phone);
  push("Souhlas s fotkami", a.photo_consent);

  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-border-strong bg-surface-muted/40 px-4 py-3 text-sm text-ink-500">
        Žádné odpovědi z dotazníku — všechny sekce na této akci jsou vypnuté.
      </p>
    );
  }

  return (
    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-border bg-surface-muted/40 p-4 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 text-sm">
          <dt className="text-ink-500">{r.label}</dt>
          <dd className="break-words text-right font-medium text-ink-900">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
