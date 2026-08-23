"use client";

import { useEffect, useState } from "react";

import { ApiError, type ParticipantProfile, type RSVPAnswers, events } from "@/lib/api";

interface Props {
  workspaceSlug: string;
  eventSlug: string;
  rsvpId: number | null;
  onClose: () => void;
}

/**
 * Owner-only modal showing one participant's profile basics — name,
 * phone, e-mail, address, emergency contact. Fetched on demand so the
 * roster table stays cheap; the table itself only needs name + email +
 * phone for at-a-glance scanning.
 */
export function ParticipantProfileDialog({
  workspaceSlug,
  eventSlug,
  rsvpId,
  onClose,
}: Props) {
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (rsvpId == null) {
      setProfile(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    events
      .participantProfile(workspaceSlug, eventSlug, rsvpId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Načtení selhalo.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, eventSlug, rsvpId]);

  // Close on Escape.
  useEffect(() => {
    if (rsvpId == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rsvpId, onClose]);

  if (rsvpId == null) return null;

  const addr = profile?.address;
  const addrLine = addr
    ? [addr.street, [addr.zip, addr.city].filter(Boolean).join(" "), addr.country]
        .filter(Boolean)
        .join(", ")
    : "";
  const ec = profile?.emergency_contact;
  const hasEc = ec && (ec.name || ec.phone);
  const hasAddr = addrLine || addr?.legacy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profil účastníka"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Profil účastníka
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="text-ink-500 hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex justify-center py-6">
              <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
            </div>
          )}
          {error && (
            <p className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          {profile && !loading && (
            <div className="flex flex-col gap-5">
              <header>
                <h2 className="text-xl font-semibold text-ink-900">
                  {profile.full_name}
                </h2>
                <p className="mt-1 text-sm text-ink-500">{profile.email}</p>
              </header>

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Kontakt
                </p>
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-ink-500">Telefon</dt>
                  <dd className="text-ink-900">
                    {profile.phone ? (
                      <a
                        href={`tel:${profile.phone}`}
                        className="text-brand hover:underline"
                      >
                        {profile.phone}
                      </a>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </dd>
                  <dt className="text-ink-500">E-mail</dt>
                  <dd className="text-ink-900">
                    <a
                      href={`mailto:${profile.email}`}
                      className="text-brand hover:underline"
                    >
                      {profile.email}
                    </a>
                  </dd>
                </dl>
              </section>

              {hasAddr && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                    Adresa
                  </p>
                  <p className="mt-2 text-sm text-ink-900">
                    {addrLine || addr?.legacy}
                  </p>
                </section>
              )}

              <RsvpFormSection profile={profile} />

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Nouzový kontakt
                </p>
                {hasEc ? (
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-ink-500">Jméno</dt>
                    <dd className="text-ink-900">{ec.name || "—"}</dd>
                    <dt className="text-ink-500">Telefon</dt>
                    <dd className="text-ink-900">
                      {ec.phone ? (
                        <a
                          href={`tel:${ec.phone}`}
                          className="text-brand hover:underline"
                        >
                          {ec.phone}
                        </a>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </dd>
                    {ec.relationship && (
                      <>
                        <dt className="text-ink-500">Vztah</dt>
                        <dd className="text-ink-900">{ec.relationship}</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-ink-500">
                    Účastník nemá vyplněný nouzový kontakt.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- RSVP form

const DIET_LABEL: Record<string, string> = {
  omnivore: "Bez omezení",
  vegetarian: "Vegetariánská",
  vegan: "Veganská",
  other: "Jiná",
};

const FITNESS_LABEL: Record<string, string> = {
  beginner: "Začátečník",
  intermediate: "Středně pokročilý",
  advanced: "Pokročilý",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Čeká na zaplacení",
  paid: "Zaplaceno",
  refunded: "Vráceno",
  waived: "Bez platby",
};

const RSVP_STATUS_LABEL: Record<string, string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítl",
  waitlist: "Waitlist",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

function RsvpFormSection({ profile }: { profile: ParticipantProfile }) {
  const { rsvp } = profile;
  const answers = rsvp.questionnaire_answers as RSVPAnswers;
  const sections = new Set(rsvp.enabled_questionnaire_sections);

  const rows: Array<[string, React.ReactNode]> = [];

  rows.push([
    "Status",
    RSVP_STATUS_LABEL[rsvp.status] ?? rsvp.status,
  ]);
  if (rsvp.is_organizer) {
    rows.push(["Role", "Organizátor"]);
  }
  if (rsvp.payment_due_amount !== null) {
    rows.push([
      "Platba",
      `${PAYMENT_LABEL[rsvp.payment_status] ?? rsvp.payment_status} · ${rsvp.payment_due_amount} ${rsvp.payment_currency}`,
    ]);
  } else if (rsvp.payment_status !== "waived") {
    rows.push(["Platba", PAYMENT_LABEL[rsvp.payment_status] ?? rsvp.payment_status]);
  }
  rows.push([
    "Přihlášen",
    new Date(rsvp.created_at).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  ]);

  if (sections.has("tshirt_size") && answers.tshirt_size) {
    rows.push(["Velikost trička", answers.tshirt_size]);
  }
  if (sections.has("diet")) {
    if (answers.diet) {
      rows.push(["Strava", DIET_LABEL[answers.diet] ?? answers.diet]);
    }
    if (answers.diet_note) {
      rows.push(["Poznámka ke stravě", answers.diet_note]);
    }
  }
  if (sections.has("fitness")) {
    if (answers.fitness_level) {
      rows.push([
        "Kondice",
        FITNESS_LABEL[answers.fitness_level] ?? answers.fitness_level,
      ]);
    }
    if (answers.fitness_note) {
      rows.push(["Poznámka ke kondici", answers.fitness_note]);
    }
    if (answers.pace_10k) rows.push(["Tempo na 10 km", answers.pace_10k]);
    if (answers.weekly_km != null && answers.weekly_km !== 0) {
      rows.push(["Kilometrů týdně", String(answers.weekly_km)]);
    }
    if (answers.longest_run) {
      rows.push(["Nejdelší běh", answers.longest_run]);
    }
  }
  if (sections.has("health_notes") && answers.health_notes) {
    rows.push(["Zdravotní poznámky", answers.health_notes]);
  }
  if (sections.has("photo_consent")) {
    rows.push([
      "Souhlas s fotkami",
      answers.photo_consent ? "Ano" : "Ne",
    ]);
  }

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        Přihláška
      </p>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <FormRow key={label} label={label} value={value} />
        ))}
      </dl>
    </section>
  );
}

function FormRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink-900">{value}</dd>
    </>
  );
}
