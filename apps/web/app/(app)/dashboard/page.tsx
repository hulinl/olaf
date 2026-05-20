"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type EventSummary,
  type TodoItem,
  type Workspace,
  assetUrl,
  auth,
  events,
  formatEventPrice,
  workspaces,
} from "@/lib/api";
import { useUser } from "@/lib/user-context";

export default function DashboardPage() {
  const user = useUser();
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[] | null>(null);
  const [myEvents, setMyEvents] = useState<EventSummary[] | null>(null);
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, mine, todoList] = await Promise.all([
          workspaces.mine(),
          events.mine().catch(() => [] as EventSummary[]),
          auth.todo().catch(() => [] as TodoItem[]),
        ]);
        if (cancelled) return;
        setMyWorkspaces(ws);
        setMyEvents(mine);
        setTodos(todoList);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Něco se nepovedlo načíst.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingRsvped = (myEvents ?? []).filter(
    (e) => new Date(e.ends_at).getTime() >= Date.now(),
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10">
          <p className="text-sm font-medium text-brand">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Ahoj, {user.first_name}.
          </h1>
          <p className="mt-2 max-w-xl text-ink-500">
            Tvůj domov na olafu — kde jsi přihlášen, kde jsi členem, co se po
            tobě chce.
          </p>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && !error && (
          <>
            <Section title="Čeká na tebe">
              {!todos || todos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
                  <p className="font-medium text-ink-900">Vše vyřízeno 🎉</p>
                  <p className="mt-1 max-w-md">
                    Tady uvidíš věci, které po tobě chtějí pořadatelé akcí
                    — třeba zaplatit nebo nahrát dokument.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {todos.map((item, i) => (
                    <TodoCard key={`${item.kind}-${item.rsvp_id}-${i}`} item={item} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Moje nadcházející akce" href="/events">
              {upcomingRsvped.length === 0 ? (
                <EmptyState
                  title="Zatím žádné přihlášky"
                  body="Až se přihlásíš na akci v některé z komunit, uvidíš ji tady."
                  cta={{ label: "Projít komunity", href: "/workspaces" }}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcomingRsvped.slice(0, 4).map((e) => (
                    <EventMini
                      key={`${e.workspace_slug}/${e.slug}`}
                      event={e}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Moje komunity" href="/workspaces">
              {(myWorkspaces?.length ?? 0) === 0 ? (
                <EmptyState
                  title="Zatím nejsi v žádné komunitě"
                  body="Vytvoř si vlastní komunitu pro tvoje akce, nebo počkej až tě někdo pozve do svojí."
                  cta={{ label: "+ Vytvořit komunitu", href: "/admin/komunity" }}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {myWorkspaces!.map((ws) => (
                    <WorkspaceMini key={ws.slug} workspace={ws} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </section>
    </main>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {href && (
          <Link
            href={href}
            className="text-sm text-ink-500 hover:text-ink-900"
          >
            Vše →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <Card>
      <CardSection>
        <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
          <h3 className="text-base font-semibold text-ink-900">{title}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{body}</p>
          {cta && (
            <LinkButton
              href={cta.href}
              variant="primary"
              size="md"
              className="mt-5"
            >
              {cta.label}
            </LinkButton>
          )}
        </div>
      </CardSection>
    </Card>
  );
}

function WorkspaceMini({ workspace }: { workspace: Workspace }) {
  const logo = assetUrl(workspace.logo_url);
  return (
    <Link
      href={`/workspaces/${workspace.slug}`}
      className="group flex items-center gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:shadow-sm focus-ring"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-strong"
        style={
          workspace.accent_color
            ? { backgroundColor: workspace.accent_color }
            : undefined
        }
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={`${workspace.name} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-base font-semibold text-ink-inverse">
            {workspace.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="truncate font-medium text-ink-900">{workspace.name}</p>
          {workspace.my_role === "owner" && (
            <span className="rounded bg-brand px-1 py-0.5 text-[10px] font-medium text-brand-ink">
              Owner
            </span>
          )}
        </div>
        {workspace.location && (
          <p className="truncate text-xs text-ink-500">{workspace.location}</p>
        )}
      </div>
    </Link>
  );
}

function EventMini({
  event,
  ownerView = false,
}: {
  event: EventSummary;
  ownerView?: boolean;
}) {
  const starts = new Date(event.starts_at);
  const cover = assetUrl(event.cover_url);
  const price = formatEventPrice(event.price_amount, event.price_currency);
  const href = ownerView
    ? `/admin/eventy/${event.workspace_slug}/${event.slug}`
    : `/events/${event.workspace_slug}/${event.slug}`;

  // Cinematic variant when a cover photo exists — mirrors the public
  // community grid (see /[slug]/page.tsx EventCard). Plain textual
  // fallback when no cover so the dashboard never grows ugly blank
  // tiles.
  if (cover) {
    return (
      <Link
        href={href}
        className="group relative isolate flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-ring"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 transition-transform duration-300 group-hover:scale-[1.02]"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.82) 100%), url(${cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="flex flex-col gap-1 p-4 text-ink-inverse">
          <p
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/85"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
          >
            {starts.toLocaleDateString("cs-CZ", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <p
            className="text-base font-semibold sm:text-lg"
            style={{
              letterSpacing: "-0.015em",
              lineHeight: 1.2,
              textShadow: "0 2px 10px rgba(0,0,0,0.55)",
            }}
          >
            {event.title}
          </p>
          {event.location_text && (
            <p
              className="text-xs text-white/85"
              style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
            >
              {event.location_text}
            </p>
          )}
          <div
            className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-white/85"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
          >
            <span>
              <strong className="text-white">{event.confirmed_count}</strong>
              {event.capacity != null ? ` / ${event.capacity}` : ""}{" "}
              přihlášeno
            </span>
            {price && (
              <span className="font-semibold tabular-nums text-white">
                {price}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:shadow-sm focus-ring"
    >
      <p className="text-xs text-ink-500">
        {starts.toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
      <p className="mt-1 font-medium text-ink-900">{event.title}</p>
      {event.location_text && (
        <p className="mt-0.5 text-xs text-ink-500">{event.location_text}</p>
      )}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 text-xs text-ink-500">
        <span>
          <strong className="text-ink-900">{event.confirmed_count}</strong>
          {event.capacity != null ? ` / ${event.capacity}` : ""} přihlášeno
        </span>
        {price && (
          <span className="font-semibold tabular-nums text-ink-900">
            {price}
          </span>
        )}
      </div>
    </Link>
  );
}

function TodoCard({ item }: { item: TodoItem }) {
  // Deep-link straight to the section the user actually needs to act
  // on — payment lands on #platba, document upload on #dokumenty. The
  // ?tab=registrace pin guarantees we land on the management tab, not
  // on the discussion wall.
  const anchor = item.kind === "payment" ? "platba" : "dokumenty";
  const eventHref = `/events/${item.workspace_slug}/${item.event_slug}?tab=registrace#${anchor}`;
  const eventDate = new Date(item.event_starts_at).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (item.kind === "payment") {
    const amount = formatEventPrice(item.amount, item.currency);
    return (
      <Link
        href={eventHref}
        className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5 transition-colors hover:border-warning hover:bg-warning/10 focus-ring sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warning">
            Zaplatit
          </p>
          <p className="mt-1 text-base font-semibold text-ink-900">
            {item.event_title}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {item.workspace_name} · {eventDate}
            {item.variable_symbol && (
              <>
                {" · VS "}
                <span className="font-mono">{item.variable_symbol}</span>
              </>
            )}
          </p>
        </div>
        <div className="text-right sm:shrink-0">
          <p className="text-xl font-semibold text-ink-900">{amount}</p>
          <p className="mt-1 text-xs text-ink-500">
            {item.iban ? "Otevřít QR Platbu →" : "Otevřít platební info →"}
          </p>
        </div>
      </Link>
    );
  }

  // Document todo
  return (
    <Link
      href={eventHref}
      className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5 transition-colors hover:border-warning hover:bg-warning/10 focus-ring sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warning">
          Doložit
        </p>
        <p className="mt-1 text-base font-semibold text-ink-900">
          {item.doc_label}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          {item.event_title} · {item.workspace_name} · {eventDate}
        </p>
      </div>
      <p className="text-xs text-ink-500 sm:shrink-0">Nahrát soubor →</p>
    </Link>
  );
}
