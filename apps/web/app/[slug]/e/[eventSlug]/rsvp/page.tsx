"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import {
  ApiError,
  events,
  type Event as OlafEvent,
  type RSVPAnswers,
  type User,
  auth,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

const TSHIRT_SIZES: RSVPAnswers["tshirt_size"][] = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
];

const DIET_OPTIONS: { value: RSVPAnswers["diet"]; label: string }[] = [
  { value: "omnivore", label: "Vše (omnivore)" },
  { value: "vegetarian", label: "Vegetarián" },
  { value: "vegan", label: "Vegan" },
  { value: "other", label: "Jiné — upřesním níže" },
];

const FITNESS_OPTIONS: {
  value: RSVPAnswers["fitness_level"];
  label: string;
}[] = [
  { value: "beginner", label: "Začátečník" },
  { value: "intermediate", label: "Středně pokročilý" },
  { value: "advanced", label: "Pokročilý" },
];

export default function RSVPPage({ params }: Props) {
  const { slug, eventSlug } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<
    "yes" | "waitlist" | "pending_approval" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Account fields (only shown if anonymous).
  const [acctEmail, setAcctEmail] = useState("");
  const [acctFirstName, setAcctFirstName] = useState("");
  const [acctLastName, setAcctLastName] = useState("");
  const [acctPhone, setAcctPhone] = useState("");

  // Questionnaire fields.
  const [tshirt, setTshirt] = useState<RSVPAnswers["tshirt_size"]>("M");
  const [diet, setDiet] = useState<RSVPAnswers["diet"]>("omnivore");
  const [dietNote, setDietNote] = useState("");
  const [fitness, setFitness] =
    useState<RSVPAnswers["fitness_level"]>("intermediate");
  const [fitnessNote, setFitnessNote] = useState("");
  const [healthNotes, setHealthNotes] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, ev] = await Promise.all([
          auth.me().catch(() => null),
          events.publicEvent(slug, eventSlug),
        ]);
        if (cancelled) return;
        setUser(me);
        setEvent(ev);
        if (me) {
          setAcctEmail(me.email);
          setAcctFirstName(me.first_name);
          setAcctLastName(me.last_name);
          setAcctPhone(me.phone);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/${slug}`);
          return;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, eventSlug, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const answers: RSVPAnswers = {
        tshirt_size: tshirt,
        diet,
        diet_note: dietNote || undefined,
        fitness_level: fitness,
        fitness_note: fitnessNote || undefined,
        health_notes: healthNotes || undefined,
        emergency_contact_name: emName,
        emergency_contact_phone: emPhone,
        photo_consent: photoConsent,
      };
      const payload = user
        ? { answers }
        : {
            answers,
            account: {
              email: acctEmail,
              first_name: acctFirstName,
              last_name: acctLastName,
              phone: acctPhone || undefined,
            },
          };
      const rsvp = await events.rsvp(slug, eventSlug, payload);
      setSubmitted(
        rsvp.status === "yes" ||
          rsvp.status === "waitlist" ||
          rsvp.status === "pending_approval"
          ? rsvp.status
          : "yes",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.firstFieldError() ?? err.message);
      } else {
        setError("Něco se pokazilo. Zkus to prosím znovu.");
      }
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

  if (!event) return null;

  if (submitted) {
    const headline =
      submitted === "yes"
        ? "Jsi přihlášen/á!"
        : submitted === "waitlist"
          ? "Jsi na waitlistu"
          : "Registrace přijata — čeká na schválení";
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {headline}
          </h1>
          <p className="mt-3 text-ink-700">
            Poslali jsme ti potvrzení na e-mail. Detaily najdeš taky na
            stránce akce.
          </p>
          <LinkButton
            href={`/${slug}/e/${eventSlug}`}
            variant="primary"
            size="lg"
            className="mt-8"
          >
            Zpět na stránku akce
          </LinkButton>
        </div>
      </main>
    );
  }

  if (!event.is_open_for_rsvp) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Registrace nejsou otevřené
          </h1>
          <p className="mt-3 text-ink-700">
            Tato akce momentálně nepřijímá přihlášky.
          </p>
          <LinkButton
            href={`/${slug}/e/${eventSlug}`}
            variant="secondary"
            size="lg"
            className="mt-8"
          >
            Zpět na stránku akce
          </LinkButton>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link
            href={`/${slug}/e/${eventSlug}`}
            className="text-sm font-medium text-ink-700 transition-colors hover:text-ink-900"
          >
            ← Zpět na {event.title}
          </Link>
          <Logo size={20} />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-14">
          <header className="mb-8">
            <p className="text-sm font-medium text-brand">Přihláška</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
              {event.title}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {event.workspace_name}
            </p>
            {event.is_at_capacity && event.waitlist_enabled && (
              <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink-900">
                Kapacita je naplněná — pokud se přihlásíš teď, půjdeš na
                waitlist a dáme ti vědět, jakmile se uvolní místo.
              </p>
            )}
          </header>

          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            {!user && (
              <Card>
                <CardSection>
                  <h2 className="text-base font-semibold text-ink-900">
                    Tvoje kontaktní údaje
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Účet ti vytvoříme automaticky a pošleme ti potvrzení na
                    e-mail.
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Jméno" htmlFor="first_name">
                      <Input
                        id="first_name"
                        required
                        autoComplete="given-name"
                        value={acctFirstName}
                        onChange={(e) => setAcctFirstName(e.target.value)}
                      />
                    </Field>
                    <Field label="Příjmení" htmlFor="last_name">
                      <Input
                        id="last_name"
                        required
                        autoComplete="family-name"
                        value={acctLastName}
                        onChange={(e) => setAcctLastName(e.target.value)}
                      />
                    </Field>
                    <Field label="E-mail" htmlFor="email">
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={acctEmail}
                        onChange={(e) => setAcctEmail(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Telefon"
                      htmlFor="phone"
                      hint="Pro emergency kontakt v terénu."
                    >
                      <Input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        value={acctPhone}
                        onChange={(e) => setAcctPhone(e.target.value)}
                      />
                    </Field>
                  </div>
                </CardSection>
              </Card>
            )}

            <Card>
              <CardSection>
                <h2 className="text-base font-semibold text-ink-900">
                  Velikost trika
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Pokud k akci patří tričko, ať trefíme tu správnou.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TSHIRT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTshirt(size)}
                      className={[
                        "h-10 w-12 rounded-md border text-sm font-medium transition-colors focus-ring",
                        tshirt === size
                          ? "border-brand bg-brand text-brand-ink"
                          : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                      ].join(" ")}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </CardSection>
            </Card>

            <Card>
              <CardSection>
                <h2 className="text-base font-semibold text-ink-900">
                  Strava a alergie
                </h2>
                <div className="mt-4 flex flex-col gap-2">
                  {DIET_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-3 rounded-md border border-border p-3 text-sm text-ink-900 hover:bg-surface-muted has-[input:checked]:border-brand"
                    >
                      <input
                        type="radio"
                        name="diet"
                        value={opt.value}
                        checked={diet === opt.value}
                        onChange={() => setDiet(opt.value)}
                        className="mt-1 accent-brand"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <Field
                    label={diet === "other" ? "Upřesni *" : "Alergie / poznámka"}
                    htmlFor="diet_note"
                    hint={
                      diet === "other"
                        ? "Povinné když volíš Jiné."
                        : "Volitelné — alergie, intolerance, …"
                    }
                  >
                    <Input
                      id="diet_note"
                      value={dietNote}
                      onChange={(e) => setDietNote(e.target.value)}
                      placeholder="např. bezlepková dieta, alergie na ořechy…"
                    />
                  </Field>
                </div>
              </CardSection>
            </Card>

            <Card>
              <CardSection>
                <h2 className="text-base font-semibold text-ink-900">
                  Tvá kondice
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Pomůže nám rozdělit skupiny a vést tempo.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {FITNESS_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-3 rounded-md border border-border p-3 text-sm text-ink-900 hover:bg-surface-muted has-[input:checked]:border-brand"
                    >
                      <input
                        type="radio"
                        name="fitness"
                        value={opt.value}
                        checked={fitness === opt.value}
                        onChange={() => setFitness(opt.value)}
                        className="mt-1 accent-brand"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <Field
                    label="Krátký popis"
                    htmlFor="fitness_note"
                    hint="Tvůj největší závod, týdenní km, cíl na sezónu — co chceš sdílet."
                  >
                    <Input
                      id="fitness_note"
                      value={fitnessNote}
                      onChange={(e) => setFitnessNote(e.target.value)}
                    />
                  </Field>
                </div>
              </CardSection>
            </Card>

            <Card>
              <CardSection>
                <h2 className="text-base font-semibold text-ink-900">
                  Zdravotní poznámky
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Volitelné. Píšeš jen organizátorům. Po skončení akce
                  smazáno do 90 dnů.
                </p>
                <div className="mt-4">
                  <Field
                    label="Zranění, chronické problémy, léky"
                    htmlFor="health"
                  >
                    <textarea
                      id="health"
                      rows={3}
                      value={healthNotes}
                      onChange={(e) => setHealthNotes(e.target.value)}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                    />
                  </Field>
                </div>
              </CardSection>
            </Card>

            <Card>
              <CardSection>
                <h2 className="text-base font-semibold text-ink-900">
                  Emergency kontakt
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Komu zavolat, kdyby se něco nestalo.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Jméno *" htmlFor="em_name">
                    <Input
                      id="em_name"
                      required
                      value={emName}
                      onChange={(e) => setEmName(e.target.value)}
                    />
                  </Field>
                  <Field label="Telefon *" htmlFor="em_phone">
                    <Input
                      id="em_phone"
                      type="tel"
                      required
                      value={emPhone}
                      onChange={(e) => setEmPhone(e.target.value)}
                    />
                  </Field>
                </div>
              </CardSection>
            </Card>

            <Card>
              <CardSection>
                <label className="flex items-start gap-3 text-sm text-ink-900">
                  <input
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(e) => setPhotoConsent(e.target.checked)}
                    className="mt-0.5 size-4 accent-brand"
                  />
                  <span>
                    Souhlasím s tím, že na akci mohou být pořízeny fotky a
                    videa a že mohu být na nich zachycen/a. Sdílení na
                    sociálních sítích pouze se souhlasem.
                  </span>
                </label>
              </CardSection>
            </Card>

            {error && <Alert variant="danger">{error}</Alert>}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
            >
              {submitting ? "Odesílám…" : "Odeslat přihlášku"}
            </Button>
          </form>
        </section>
      </main>
    </>
  );
}
