"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import {
  ApiError,
  type Event as OlafEvent,
  type QuestionnaireSection,
  type RSVPAnswers,
  type User,
  auth,
  events,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

const TSHIRT_SIZES: NonNullable<RSVPAnswers["tshirt_size"]>[] = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
];

const DIET_OPTIONS: {
  value: NonNullable<RSVPAnswers["diet"]>;
  label: string;
}[] = [
  { value: "omnivore", label: "Vše (omnivore)" },
  { value: "vegetarian", label: "Vegetarián" },
  { value: "vegan", label: "Vegan" },
  { value: "other", label: "Jiné — upřesním níže" },
];

const FITNESS_OPTIONS: {
  value: NonNullable<RSVPAnswers["fitness_level"]>;
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

  // Questionnaire fields (initialised once event + user load).
  const [tshirt, setTshirt] = useState<NonNullable<RSVPAnswers["tshirt_size"]>>("M");
  const [diet, setDiet] =
    useState<NonNullable<RSVPAnswers["diet"]>>("omnivore");
  const [dietNote, setDietNote] = useState("");
  const [fitness, setFitness] =
    useState<NonNullable<RSVPAnswers["fitness_level"]>>("intermediate");
  const [fitnessNote, setFitnessNote] = useState("");
  const [pace10k, setPace10k] = useState("");
  const [weeklyKm, setWeeklyKm] = useState("");
  const [longestRun, setLongestRun] = useState("");
  const [healthNotes, setHealthNotes] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);
  // GDPR special-category checkbox. Vyžadujeme jen u sekcí, které
  // sbírají údaje o zdraví (dieta, fitness, health_notes). Bez
  // explicitního souhlasu nesmíme tyto údaje zpracovat (čl. 9 GDPR).
  const [healthDataConsent, setHealthDataConsent] = useState(false);

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
          // Prefill stable fields from profile.
          if (me.tshirt_size && TSHIRT_SIZES.includes(me.tshirt_size as never)) {
            setTshirt(me.tshirt_size as NonNullable<RSVPAnswers["tshirt_size"]>);
          }
          if (me.diet) setDiet(me.diet);
          if (me.diet_note) setDietNote(me.diet_note);
          if (me.fitness_level) setFitness(me.fitness_level);
          if (me.fitness_note) setFitnessNote(me.fitness_note);
          if (me.pace_10k) setPace10k(me.pace_10k);
          if (me.weekly_km != null) setWeeklyKm(String(me.weekly_km));
          if (me.longest_run) setLongestRun(me.longest_run);
          if (me.emergency_contact_name) setEmName(me.emergency_contact_name);
          if (me.emergency_contact_phone) setEmPhone(me.emergency_contact_phone);
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

  function sectionEnabled(s: QuestionnaireSection): boolean {
    if (!event) return false;
    return event.enabled_questionnaire_sections.includes(s);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSubmitting(true);
    setError(null);
    try {
      const answers: RSVPAnswers = {};
      if (sectionEnabled("tshirt_size")) answers.tshirt_size = tshirt;
      if (sectionEnabled("diet")) {
        answers.diet = diet;
        if (dietNote) answers.diet_note = dietNote;
      }
      if (sectionEnabled("fitness")) {
        answers.fitness_level = fitness;
        if (fitnessNote) answers.fitness_note = fitnessNote;
        if (pace10k) answers.pace_10k = pace10k;
        if (weeklyKm) answers.weekly_km = Number(weeklyKm);
        if (longestRun) answers.longest_run = longestRun;
      }
      if (sectionEnabled("health_notes") && healthNotes) {
        answers.health_notes = healthNotes;
      }
      if (sectionEnabled("emergency_contact")) {
        answers.emergency_contact_name = emName;
        answers.emergency_contact_phone = emPhone;
      }
      if (sectionEnabled("photo_consent")) answers.photo_consent = photoConsent;

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
        // Speciální případ: 409 + code=email_has_account znamená, že
        // ten e-mail už má plnohodnotný (verified) účet. Posíláme
        // usera na login místo generického "tento e-mail už existuje",
        // což z hlediska UX líp navádí. Bezpečnostní pojistka: anon
        // submitter nemůže přepsat / "vetknout se" do session
        // vlastníka e-mailu.
        if (err.status === 409 && err.data?.code === "email_has_account") {
          setError(
            'Tento e-mail už má účet. Přihlas se prosím a registraci zopakuj.',
          );
        } else {
          setError(err.firstFieldError() ?? err.message);
        }
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
    // Akce bez ceny / s waived platbou nemá "pokyny k platbě" — ten
    // text byl pro free akce zavádějící. Vlastní copy pro pending /
    // waitlist / free / paid, ať pokaždé sedne na to, co user
    // skutečně dostane v mailu + co bude muset udělat dál.
    const isPaid =
      event.price_amount != null && Number(event.price_amount) > 0;
    const successBody =
      submitted === "pending_approval"
        ? "Poslali jsme ti potvrzení na e-mail. Až tvojí registraci pořadatel schválí, dáme vědět."
        : submitted === "waitlist"
          ? "Jakmile se uvolní místo, povýšíme tě z waitlistu a pošleme ti e-mail s dalšími kroky."
          : isPaid
            ? user
              ? "Poslali jsme ti potvrzení na e-mail. Pokyny k platbě a další kroky najdeš ve své účasti."
              : "Poslali jsme ti potvrzení na e-mail s pokyny k platbě a dalšími kroky."
            : user
              ? "Poslali jsme ti potvrzení na e-mail. Detaily akce najdeš ve své účasti."
              : "Poslali jsme ti potvrzení na e-mail. Detaily akce najdeš v něm.";
    return (
      <main className="flex flex-1 flex-col items-center px-4 py-16">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {headline}
          </h1>
          <p className="mt-3 text-ink-700">{successBody}</p>
          {/* Anonymous flow → žádný auto-login, žádné "Moje účast"
              cesty do aplikace. Místo toho ukážeme měkkou nabídku
              vytvořit si účet s pre-filled e-mailem; pokud user
              vyplnil ne-prázdnou hodnotu v acctEmail, předáme ho do
              signup URL. */}
          {!user && (
            <p className="mt-6 text-sm text-ink-500">
              Chceš spravovat svoje registrace a vidět všechny své akce na
              jednom místě?{" "}
              <Link
                href={
                  acctEmail
                    ? `/signup?email=${encodeURIComponent(acctEmail)}`
                    : "/signup"
                }
                className="font-medium text-ink-900 underline hover:text-brand"
              >
                Vytvořit si tu zdarma účet →
              </Link>
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {user ? (
            <LinkButton
              href={`/events/${slug}/${eventSlug}`}
              variant="primary"
              size="lg"
            >
              Moje účast →
            </LinkButton>
          ) : null}
          <LinkButton
            href={`/${slug}/e/${eventSlug}`}
            variant={user ? "secondary" : "primary"}
            size="lg"
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
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Breadcrumbs
            items={[
              { label: event.title, href: `/${slug}/e/${eventSlug}` },
              { label: "Přihláška" },
            ]}
            className="min-w-0 truncate"
          />
          <Logo size={20} />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-14">
          <Link
            href={`/${slug}/e/${eventSlug}`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 5 L7 10 L12 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Zpět na akci
          </Link>
          <header className="mt-6 mb-8">
            <p className="text-sm font-medium text-brand">Přihláška</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
              {event.title}
            </h1>
            {user && (
              <p className="mt-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-ink-700">
                Některá pole jsme předvyplnili z tvého{" "}
                <Link
                  href="/settings/profile"
                  className="font-medium underline"
                >
                  profilu
                </Link>
                . Změny tady se uloží jen k této akci, profil zůstane.
              </p>
            )}
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
                    {/* Když owner odznačil "Vyžadovat telefon" v
                        Detailech akce, pole vůbec neukážeme — méně
                        frikce, žádné zbytečné "Telefon (volitelné)".
                        User k tomu: "když řeknu že ho tam nechci, tak
                        ať tam to pole ani není". */}
                    {event.require_phone_on_rsvp && (
                      <Field
                        label="Telefon"
                        htmlFor="phone"
                        hint="Pro případ nouze nebo rychlou komunikaci."
                      >
                        <Input
                          id="phone"
                          type="tel"
                          autoComplete="tel"
                          required
                          value={acctPhone}
                          onChange={(e) => setAcctPhone(e.target.value)}
                        />
                      </Field>
                    )}
                  </div>
                </CardSection>
              </Card>
            )}

            {sectionEnabled("tshirt_size") && (
              <Card>
                <CardSection>
                  <h2 className="text-base font-semibold text-ink-900">
                    Velikost trika
                  </h2>
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
            )}

            {sectionEnabled("diet") && (
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
                      label={
                        diet === "other" ? "Upřesni *" : "Alergie / poznámka"
                      }
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
            )}

            {sectionEnabled("fitness") && (
              <Card>
                <CardSection>
                  <h2 className="text-base font-semibold text-ink-900">
                    Kondice a výkonnost
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Pomáhá nám s tempem ve skupinách. Čísla jsou volitelná —
                    vyplň co znáš.
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
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field
                      label="Čas na 10 km na rovince"
                      htmlFor="pace10k"
                      hint='např. "55:00"'
                    >
                      <Input
                        id="pace10k"
                        value={pace10k}
                        onChange={(e) => setPace10k(e.target.value)}
                        placeholder="55:00"
                      />
                    </Field>
                    <Field label="Týdenní km (průměr)" htmlFor="weeklyKm">
                      <Input
                        id="weeklyKm"
                        type="number"
                        min={0}
                        value={weeklyKm}
                        onChange={(e) => setWeeklyKm(e.target.value)}
                        placeholder="30"
                      />
                    </Field>
                    <Field
                      label="Nejdelší souvislý běh"
                      htmlFor="longestRun"
                      hint='např. "21 km"'
                    >
                      <Input
                        id="longestRun"
                        value={longestRun}
                        onChange={(e) => setLongestRun(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field
                      label="Krátká poznámka"
                      htmlFor="fitness_note"
                      hint="Cíl na sezónu, oblíbený typ tréninku, …"
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
            )}

            {sectionEnabled("health_notes") && (
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
            )}

            {sectionEnabled("emergency_contact") && (
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
            )}

            {sectionEnabled("photo_consent") && (
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
            )}

            {/* GDPR special category — jen když je zapnutá sekce s
                údaji o zdraví. Bez zaškrtnutí submit nepustíme. */}
            {(sectionEnabled("diet") ||
              sectionEnabled("fitness") ||
              sectionEnabled("health_notes")) && (
              <label className="flex items-start gap-3 rounded-md border border-border bg-surface-muted/40 p-3 text-sm text-ink-700">
                <input
                  type="checkbox"
                  required
                  checked={healthDataConsent}
                  onChange={(e) => setHealthDataConsent(e.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-brand"
                />
                <span>
                  Souhlasím se zpracováním <strong>údajů o zdraví</strong>{" "}
                  (dieta, alergie, kondice, zdravotní poznámky) výhradně
                  pro organizaci této akce. Souhlas mohu kdykoli odvolat
                  zrušením registrace.
                </span>
              </label>
            )}

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

            {/* GDPR info-block — informace při sběru dle čl. 13 GDPR.
                Olaf je správce dat (controller); na všech tenantech je
                politika jednotná, není možné si dělat each-workspace
                vlastní pravidla. */}
            <p className="text-xs text-ink-500">
              Odesláním uložíme tvé jméno, e-mail{acctPhone && ", telefon"} a
              vyplněné odpovědi pro organizaci této akce a komunikaci s tebou.
              Správcem osobních údajů je platforma olaf. Tvá práva (přístup,
              oprava, výmaz, přenositelnost) a kompletní pravidla najdeš v{" "}
              <Link
                href="/legal/zasady-ochrany-osobnich-udaju"
                target="_blank"
                className="underline hover:text-ink-900"
              >
                Zásadách ochrany osobních údajů ↗
              </Link>
              . Registraci můžeš kdykoli zrušit z potvrzovacího e-mailu.
            </p>
          </form>
        </section>
      </main>
    </>
  );
}
