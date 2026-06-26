"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";

import { DiscussionWall } from "@/components/discussion-wall";
import { PaymentInstructionsPanel } from "@/components/payment-instructions-panel";
import { RequiredDocsPanel } from "@/components/required-docs-panel";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useUser } from "@/lib/user-context";
import {
  ApiError,
  type Event as OlafEvent,
  type Invoice,
  assetUrl,
  events,
  formatEventPrice,
} from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

const RSVP_STATUS_LABEL: Record<string, string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítl",
  waitlist: "Na waitlistu",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

const RSVP_STATUS_TONE: Record<string, string> = {
  yes: "bg-success/15 text-success",
  waitlist: "bg-warning/15 text-warning",
  pending_approval: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  maybe: "bg-surface-muted text-ink-500",
  no: "bg-surface-muted text-ink-500",
};

type TabKey = "nastenka" | "registrace" | "vybaveni";
type RegSubTab = "platba" | "dokumenty" | "faktura";

const REG_SUBTABS_FROM_HASH: Record<string, RegSubTab> = {
  platba: "platba",
  dokumenty: "dokumenty",
  faktura: "faktura",
};

/**
 * Participant's event hub.
 *
 * Two tabs:
 *   - Nástěnka — event-wide discussion wall (community side)
 *   - Moje rezervace — personal: status, platba (QR), required documents,
 *     invoice + PDF, zrušit registraci
 *
 * The split keeps the social feed and the personal admin out of each
 * other's way: scrolling the wall doesn't bury the QR code, and
 * managing payment doesn't drown out new posts.
 */
export default function MyEventPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialTab: TabKey =
    searchParams.get("tab") === "registrace" ? "registrace" : "nastenka";
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ev = await events.publicEvent(wsSlug, eventSlug);
        if (cancelled) return;
        setEvent(ev);
        // Invoice is optional — 404 = no invoice yet, that's fine.
        try {
          const inv = await events.myInvoice(wsSlug, eventSlug);
          if (!cancelled) setInvoice(inv);
        } catch {
          // ignore
        }
        // No RSVP yet? Default to the management tab so the user lands
        // on the "Přihlásit se" CTA instead of an empty wall. Skip when
        // the URL already specifies a tab — that's an explicit deep-link
        // (e.g. dashboard "Doložit dokument" → ?tab=registrace#dokumenty).
        if (
          !cancelled &&
          !ev.my_rsvp &&
          !searchParams.get("tab")
        ) {
          setTab("registrace");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/events/${wsSlug}/${eventSlug}`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/events");
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
  }, [wsSlug, eventSlug, router, searchParams]);

  // Deep-link hash (#platba / #dokumenty / #faktura) selects the
  // matching sub-tab inside Registrace. Done as state read once on
  // mount — the panel owns the sub-tab state from there.
  const initialRegSubTab: RegSubTab | undefined =
    typeof window !== "undefined"
      ? REG_SUBTABS_FROM_HASH[window.location.hash.replace("#", "")]
      : undefined;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }
  if (error) {
    return (
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-4 py-10">
          <Alert variant="danger">{error}</Alert>
        </section>
      </main>
    );
  }
  if (!event) return null;

  const my = event.my_rsvp;
  // Pending_approval doesn't grant wall access yet — owner might
  // still reject. Mirror the backend gate (can_access_event_wall).
  const hasActiveRsvp =
    !!my && my.status !== "cancelled" && my.status !== "pending_approval";
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const sameDay = starts.toDateString() === ends.toDateString();
  const dateLabel = sameDay
    ? starts.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : `${starts.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })} – ${ends.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:py-12">
        <Link
          href="/events"
          className="text-sm text-ink-500 hover:text-ink-900"
        >
          ← Zpět na moje akce
        </Link>

        <header>
          <p className="text-sm font-medium text-brand">Moje účast</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {dateLabel}
            {event.location_text && ` · ${event.location_text}`}
          </p>
          {/* Public landing link on its own line — used to be inline
              after the date and would wrap mid-link on phones, leaving
              the ↗ orphaned on a new row. */}
          <a
            href={`/${wsSlug}/e/${eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-ink-500 underline hover:text-ink-900"
          >
            <span className="whitespace-nowrap">Otevřít stránku akce ↗</span>
          </a>
        </header>

        <TabBar
          tab={tab}
          onChange={setTab}
          hasGear={
            !!event.recommended_gear_list &&
            event.recommended_gear_list.entries.length > 0
          }
        />

        {/* The participant zone is a "framed card" for registration /
            documents — but the nástěnka is itself already a bordered
            section, so wrapping it in the same frame doubles up the
            chrome and steals horizontal real estate. Skip the inner
            canvas + padding wrapper when nastenka is active so the
            wall gets the full width of the page. */}
        <div
          className={
            tab === "nastenka"
              ? ""
              : "rounded-2xl border border-border bg-surface-muted/30 p-1"
          }
        >
          <div
            className={
              tab === "nastenka" ? "" : "rounded-xl bg-canvas p-4 sm:p-6"
            }
          >
            {tab === "nastenka" ? (
              hasActiveRsvp || event.i_am_owner ? (
                <DiscussionWall
                  scope={{
                    kind: "event",
                    workspaceSlug: wsSlug,
                    eventSlug,
                    isModerator: !!event.i_am_owner,
                  }}
                  currentUserId={user.id}
                  topicHref={(topicId) =>
                    `/events/${wsSlug}/${eventSlug}/nastenka/${topicId}`
                  }
                />
              ) : my?.status === "pending_approval" ? (
                <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                  <h3 className="text-base font-semibold text-ink-900">
                    Čekáš na schválení
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                    Tvoje přihláška čeká na schválení pořadatelem. Diskuzi
                    k akci uvidíš, jakmile přihlášku schválí.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                  <h3 className="text-base font-semibold text-ink-900">
                    Nástěnka je pro přihlášené
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                    Diskuze k akci se otevře jakmile potvrdíš svou účast.
                  </p>
                  <Link
                    href={`/${wsSlug}/e/${eventSlug}/rsvp`}
                    className="mt-4 inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:opacity-90"
                  >
                    Přihlásit se →
                  </Link>
                </div>
              )
            ) : tab === "vybaveni" ? (
              event.recommended_gear_list && my ? (
                <GearChecklistPanel
                  list={event.recommended_gear_list}
                  initialState={my.gear_checklist ?? {}}
                  wsSlug={wsSlug}
                  eventSlug={eventSlug}
                />
              ) : (
                <p className="text-sm text-ink-500">Žádný gear list není přiřazen.</p>
              )
            ) : (
              <MyReservationPanel
                event={event}
                invoice={invoice}
                wsSlug={wsSlug}
                eventSlug={eventSlug}
                initialSubTab={initialRegSubTab}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function GearChecklistPanel({
  list,
  initialState,
  wsSlug,
  eventSlug,
}: {
  list: NonNullable<OlafEvent["recommended_gear_list"]>;
  initialState: Record<string, string>;
  wsSlug: string;
  eventSlug: string;
}) {
  const [state, setState] = useState(initialState);
  const total = list.entries.length;
  const done = list.entries.filter((e) => state[String(e.id)]).length;

  async function toggle(itemId: number, next: boolean) {
    const key = String(itemId);
    // Optimistic
    setState((prev) => {
      const copy = { ...prev };
      if (next) copy[key] = new Date().toISOString();
      else delete copy[key];
      return copy;
    });
    try {
      const r = await events.toggleGearChecklistItem(
        wsSlug,
        eventSlug,
        itemId,
        next,
      );
      setState(r.gear_checklist);
    } catch {
      // Rollback
      setState((prev) => {
        const copy = { ...prev };
        if (next) delete copy[key];
        else copy[key] = new Date().toISOString();
        return copy;
      });
    }
  }

  // Group entries by category for visual grouping.
  const byCategory = new Map<string, typeof list.entries>();
  for (const e of list.entries) {
    const cat = e.category || "Ostatní";
    const arr = byCategory.get(cat) ?? [];
    arr.push(e);
    byCategory.set(cat, arr);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Doporučené vybavení · {list.name}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-900">
            Co si vzít s sebou
          </h2>
        </div>
        <div className="text-sm text-ink-500">
          <strong className="text-ink-900 tabular-nums">{done}</strong>{" "}
          / {total} odškrtáno
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full bg-brand transition-all"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
        />
      </div>

      <div className="flex flex-col gap-5">
        {[...byCategory.entries()].map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              {cat}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {items.map((e) => {
                const checked = !!state[String(e.id)];
                return (
                  <li key={e.id}>
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-brand/40 bg-brand/5 text-ink-500 line-through"
                          : "border-border bg-surface text-ink-900 hover:bg-surface-muted",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => toggle(e.id, ev.target.checked)}
                        className="size-4 accent-brand"
                      />
                      <span className="flex-1">
                        {e.name}
                        {e.quantity > 1 && (
                          <span className="ml-1 font-mono text-xs text-ink-500">
                            ×{e.quantity}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabBar({
  tab,
  onChange,
  hasGear,
}: {
  tab: TabKey;
  onChange: (next: TabKey) => void;
  hasGear: boolean;
}) {
  // Free-floating pill buttons (no surrounding panel) — matches the
  // workspace-landing tab style the user explicitly liked
  // ("oranžově a jsou to jenom dvě tlačítka"). The previous segmented
  // grid worked but visually walled the tabs off; loose pills feel
  // lighter and consistent with the komunita surface.
  return (
    <div
      role="tablist"
      aria-label="Sekce akce"
      className="flex flex-wrap gap-2 text-sm"
    >
      <TabButton
        active={tab === "nastenka"}
        onClick={() => onChange("nastenka")}
        label="Nástěnka"
      />
      <TabButton
        active={tab === "registrace"}
        onClick={() => onChange("registrace")}
        label="Registrace"
      />
      {hasGear && (
        <TabButton
          active={tab === "vybaveni"}
          onClick={() => onChange("vybaveni")}
          label="Vybavení"
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-md border px-3 py-1.5 text-sm font-medium focus-ring",
        active
          ? "border-brand bg-brand text-brand-ink"
          : "border-border bg-surface text-ink-700 hover:bg-surface-muted hover:text-ink-900",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function RegSubTabs({
  active,
  onChange,
  fakturaAvailable,
}: {
  active: RegSubTab;
  onChange: (next: RegSubTab) => void;
  fakturaAvailable: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Sekce registrace"
      className="flex flex-wrap gap-2 text-sm"
    >
      <TabButton
        active={active === "platba"}
        onClick={() => onChange("platba")}
        label="Platba"
      />
      <TabButton
        active={active === "dokumenty"}
        onClick={() => onChange("dokumenty")}
        label="Dokumenty"
      />
      {fakturaAvailable && (
        <TabButton
          active={active === "faktura"}
          onClick={() => onChange("faktura")}
          label="Faktura"
        />
      )}
    </div>
  );
}

function MyReservationPanel({
  event,
  invoice,
  wsSlug,
  eventSlug,
  initialSubTab,
}: {
  event: OlafEvent;
  invoice: Invoice | null;
  wsSlug: string;
  eventSlug: string;
  initialSubTab?: RegSubTab;
}) {
  const my = event.my_rsvp;
  // Sub-tabs replace the previous platba/dokumenty/faktura
  // scroll-anchor stack — the user explicitly prefers swap-in-place
  // tabs over anchor jumps (back button gets confused, the URL
  // doesn't tell you which section is active).
  //
  // Default tab pick: honor a deep-link hash if it points at a real
  // section (faktura collapses to platba when no invoice yet), else
  // start on platba. The user lands here from the dashboard either
  // because they owe money (anchor=platba) or need to upload docs
  // (anchor=dokumenty) — platba is the safer default when no anchor.
  const fakturaAvailable = invoice != null;
  const subTabResolved: RegSubTab =
    initialSubTab === "faktura" && !fakturaAvailable
      ? "platba"
      : initialSubTab ?? "platba";
  const [subTab, setSubTab] = useState<RegSubTab>(subTabResolved);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Sekce
        </p>
        <h2 className="text-xl font-semibold text-ink-900">Moje registrace</h2>
        <p className="text-sm text-ink-500">
          Status přihlášky, pokyny k platbě, povinné dokumenty a faktura.
        </p>
      </header>

      {/* RSVP status summary — tab-independent so it stays above the
          sub-tab strip; status is small + useful regardless of which
          sub-section the user clicked into. */}
      {my && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold text-ink-900">
              Status registrace
            </h3>
            <div className="flex items-center gap-2">
              {my.waitlist_position != null && (
                <span
                  className="text-xs text-ink-500"
                  title="Tvoje pořadí ve frontě. Pokud se někdo odhlásí, posunou se před tebou jen lidé s nižším pořadím."
                >
                  {my.waitlist_position}.&nbsp;v pořadí
                </span>
              )}
              <span
                className={[
                  "inline-flex rounded-full px-3 py-0.5 text-xs font-semibold",
                  RSVP_STATUS_TONE[my.status] ??
                    "bg-surface-muted text-ink-500",
                ].join(" ")}
              >
                {RSVP_STATUS_LABEL[my.status] ?? my.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {!my && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
          Na tuto akci nejsi přihlášen/á.{" "}
          <Link
            href={`/${wsSlug}/e/${eventSlug}/rsvp`}
            className="font-medium text-brand underline"
          >
            Přihlásit se →
          </Link>
        </div>
      )}

      <RegSubTabs
        active={subTab}
        onChange={setSubTab}
        fakturaAvailable={fakturaAvailable}
      />

      {subTab === "platba" && (
        <PaymentInstructionsPanel
          workspaceSlug={wsSlug}
          eventSlug={eventSlug}
        />
      )}

      {subTab === "dokumenty" && (
        <RequiredDocsPanel workspaceSlug={wsSlug} eventSlug={eventSlug} />
      )}

      {subTab === "faktura" && invoice && (
        <section
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink-900">Faktura</h3>
              <p className="mt-1 text-sm text-ink-500">
                {invoice.number} · vystavena{" "}
                {new Date(invoice.issued_at).toLocaleDateString("cs-CZ", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <span className="inline-flex rounded-full bg-success/20 px-3 py-0.5 text-xs font-semibold text-success">
              {invoice.status === "paid" ? "Zaplaceno" : invoice.status}
            </span>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-500">Částka</dt>
              <dd className="font-semibold text-ink-900">
                {formatEventPrice(invoice.total, invoice.currency)}
              </dd>
              <dt className="text-ink-500">Variabilní symbol</dt>
              <dd className="font-mono text-ink-900">
                {invoice.variable_symbol || "—"}
              </dd>
              <dt className="text-ink-500">Dodavatel</dt>
              <dd className="text-ink-700">{invoice.supplier_name}</dd>
              <dt className="text-ink-500">Odběratel</dt>
              <dd className="text-ink-700">{invoice.customer_name}</dd>
            </dl>
            {invoice.has_qr && (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(
                    `/api/events/${wsSlug}/${eventSlug}/invoices/${invoice.id}/qr.png`,
                  )}
                  alt="QR Platba"
                  width={160}
                  height={160}
                  className="rounded-md border border-border bg-white p-2"
                />
                <span className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
                  QR Platba
                </span>
              </div>
            )}
          </div>
          <div className="mt-4">
            <a
              href={assetUrl(
                `/api/events/${wsSlug}/${eventSlug}/invoices/${invoice.id}/pdf/`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted focus-ring"
            >
              Stáhnout PDF ↓
            </a>
          </div>
        </section>
      )}

      {my && my.status !== "cancelled" && event.status !== "cancelled" && (
        <div className="rounded-md border border-danger/30 bg-danger-soft/30 p-4 text-sm text-ink-700">
          <p>
            Chceš svojí registraci zrušit? Klik níže ji okamžitě zruší a
            uvolní místo dalšímu zájemci.
          </p>
          <CancelRsvpButton wsSlug={wsSlug} eventSlug={eventSlug} />
        </div>
      )}
    </div>
  );
}

function CancelRsvpButton({
  wsSlug,
  eventSlug,
}: {
  wsSlug: string;
  eventSlug: string;
}) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    const ok = await confirmDialog({
      title: "Zrušit registraci?",
      description:
        "Z účasti se odhlásíš a uvolníš místo dalšímu na waitlistu. Můžeš se kdykoli znovu přihlásit, pokud kapacita dovolí.",
      confirmLabel: "Zrušit registraci",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await events.cancelMyRsvp(wsSlug, eventSlug);
      router.refresh();
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Zrušení se nepovedlo. Zkus to prosím znovu.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="inline-flex w-fit items-center rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
      >
        {busy ? "Ruším…" : "Zrušit registraci"}
      </button>
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
