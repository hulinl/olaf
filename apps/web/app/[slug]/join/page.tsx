"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { AppFooter } from "@/components/ui/app-footer";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import {
  ApiError,
  type User,
  type Workspace,
  auth,
  workspaces as workspacesApi,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Dedikovaná stránka pro žádost o vstup do public workspacu.
 *
 * Na landing (`/[slug]`) máme jen malé „Přidej se do komunity" tlačítko
 * → tato stránka drží celý flow, aby velký form nevyšel po vizuálu
 * landingu. Tři cesty:
 *
 * - Anon: dvě velké volby — vytvořit účet (`/signup`) nebo se
 *   přihlásit (`/login?next=/[slug]/join`). Fallback pro lidi, co
 *   účet nechtějí, je diskrétní guest form dole na stránce (reuse
 *   light_user pattern z RSVP anon flow).
 * - Auth non-member: jednoduché „Potvrdit žádost o vstup" tlačítko —
 *   backend má session, jedno kliknutí.
 * - Member / pending: informativní karta a link zpět na komunitu.
 */
export default function WorkspaceJoinPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<
    "pending" | "already_member" | "already_pending" | null
  >(null);

  // Guest fallback form. Držíme oddělený stav — user může přepnout
  // ke guest submitu z anon větve, ale primární CTA jsou signup / login.
  const [guestOpen, setGuestOpen] = useState(false);
  const [acctEmail, setAcctEmail] = useState("");
  const [acctFirstName, setAcctFirstName] = useState("");
  const [acctLastName, setAcctLastName] = useState("");
  const [acctPhone, setAcctPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, ws] = await Promise.all([
          auth.me().catch(() => null),
          workspacesApi.byPublicSlug(slug),
        ]);
        if (cancelled) return;
        setUser(me);
        setWorkspace(ws);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/${slug}`);
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Načtení se nepovedlo.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  async function submitJoin(
    account?: {
      email: string;
      first_name: string;
      last_name: string;
      phone?: string;
    },
  ) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await workspacesApi.join(slug, account);
      setSubmitted(res.status);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.data?.code === "email_has_account"
      ) {
        // Guest zadal e-mail plnohodnotného účtu — pošleme ho na login
        // s prefill a next=. Bezpečnostní pojistka: nikdy anon
        // nepřepíše cizí session, backend garantuje.
        const emailQ = encodeURIComponent(account?.email ?? "");
        router.replace(
          `/login?next=/${slug}/join&email=${emailQ}`,
        );
        return;
      }
      setError(
        err instanceof ApiError
          ? (err.firstFieldError() ?? err.message)
          : "Přihlášení se nezdařilo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleGuestSubmit(e: FormEvent) {
    e.preventDefault();
    submitJoin({
      email: acctEmail.trim(),
      first_name: acctFirstName.trim(),
      last_name: acctLastName.trim(),
      phone: acctPhone.trim() || undefined,
    });
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (!workspace) return null;

  // Non-public workspacu se rovnou vrátíme na landing — public_workspace
  // stejně vrací 404 na private, tady chytáme unlisted (přístupný, ale
  // ne self-serve).
  if (workspace.visibility !== "public") {
    router.replace(`/${slug}`);
    return null;
  }

  const backHref = `/${slug}`;

  const header = (
    <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" aria-label="olaf">
          <Logo size={26} />
        </Link>
        <PublicAuthIndicator />
      </div>
    </header>
  );

  // ---- SUCCESS / already-state ---------------------------------------
  const memberStatus = workspace.my_membership?.status;

  if (submitted === "already_member" || memberStatus === "active") {
    return (
      <div className="bg-canvas text-ink-900">
        {header}
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Jsi členem komunity
          </h1>
          <p className="mt-3 max-w-md text-ink-700">
            Máš přístup ke všem komunitním akcím a aktualitám.
          </p>
          <div className="mt-8">
            <LinkButton href={backHref} variant="primary" size="lg">
              Zpět na komunitu →
            </LinkButton>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  if (
    submitted === "already_pending" ||
    submitted === "pending" ||
    memberStatus === "pending"
  ) {
    return (
      <div className="bg-canvas text-ink-900">
        {header}
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {submitted === "pending"
              ? "Žádost odeslána"
              : "Čekáš na schválení"}
          </h1>
          <p className="mt-3 max-w-md text-ink-700">
            {submitted === "pending"
              ? `Poslali jsme ti potvrzení na e-mail. Až tvojí žádost správce komunity „${workspace.name}" schválí, dáme vědět.`
              : `Tvoji žádost teď posuzuje správce komunity „${workspace.name}". Až rozhodne, přijde ti upozornění.`}
          </p>
          {!user && (submitted === "pending") && (
            <div className="mt-6 w-full max-w-md rounded-2xl border border-brand/30 bg-brand/5 p-5 text-left">
              <h2 className="text-base font-semibold text-ink-900">
                Dokonči registraci — nastav si účet
              </h2>
              <p className="mt-2 text-sm text-ink-700">
                Zvládneš to za 30 vteřin. Uvidíš všechny komunity a akce,
                ve kterých jsi, na jednom místě.
              </p>
              <div className="mt-4">
                <LinkButton
                  href={
                    acctEmail
                      ? `/signup?email=${encodeURIComponent(acctEmail)}`
                      : "/signup"
                  }
                  variant="primary"
                  size="lg"
                  fullWidth
                >
                  Vytvořit účet →
                </LinkButton>
              </div>
            </div>
          )}
          <div className="mt-8">
            <LinkButton href={backHref} variant="secondary" size="lg">
              Zpět na komunitu
            </LinkButton>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---- AUTHENTICATED non-member: single-click confirm -----------------
  if (user) {
    return (
      <div className="bg-canvas text-ink-900">
        {header}
        <main className="mx-auto flex max-w-3xl flex-col px-4 py-12">
          <div className="mx-auto w-full max-w-lg">
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
              Přidej se do komunity {workspace.name}
            </h1>
            <p className="mt-3 text-ink-700">
              Pošleme tvůj požadavek správci komunity. Až ho schválí,
              dostaneš upozornění a získáš přístup k členským akcím.
            </p>
            {error && (
              <div className="mt-4">
                <Alert variant="danger">{error}</Alert>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => submitJoin()}
                loading={submitting}
              >
                Potvrdit žádost o vstup
              </Button>
              <LinkButton href={backHref} variant="secondary" size="lg">
                Zpět na komunitu
              </LinkButton>
            </div>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---- ANONYMOUS: signup / login primary + optional guest form --------
  const nextParam = encodeURIComponent(`/${slug}/join`);
  return (
    <div className="bg-canvas text-ink-900">
      {header}
      <main className="mx-auto flex max-w-3xl flex-col px-4 py-12">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Přidej se do komunity {workspace.name}
          </h1>
          <p className="mt-3 text-ink-700">
            Vyber si, jak dál. Pokud u nás už máš účet, přihlas se — jinak
            si ho na chvilku vytvoř, ať máš žádosti a přihlášky na jednom
            místě.
          </p>

          <Card className="mt-6">
            <CardSection>
              <div className="flex flex-col gap-3">
                <LinkButton
                  href={`/signup?next=/${slug}/join`}
                  variant="primary"
                  size="lg"
                  fullWidth
                >
                  Zaregistrovat se
                </LinkButton>
                <LinkButton
                  href={`/login?next=${nextParam}`}
                  variant="secondary"
                  size="lg"
                  fullWidth
                >
                  Už mám účet — přihlásit se
                </LinkButton>
              </div>
            </CardSection>
          </Card>

          <div className="mt-6 text-center text-sm text-ink-500">
            Nechceš teď zakládat účet?{" "}
            <button
              type="button"
              onClick={() => setGuestOpen((v) => !v)}
              className="underline underline-offset-2 hover:text-ink-700"
            >
              {guestOpen ? "Schovat" : "Pošli jen žádost bez účtu"}
            </button>
          </div>

          {guestOpen && (
            <Card className="mt-4">
              <CardSection>
                <p className="text-sm text-ink-500">
                  Pošli žádost i bez plné registrace. Až tvojí žádost
                  správce schválí, dáme vědět e-mailem. Účet si můžeš
                  založit později.
                </p>
                <form
                  onSubmit={handleGuestSubmit}
                  className="mt-4 flex flex-col gap-3"
                >
                  <Field label="E-mail" htmlFor="wjoin-email">
                    <Input
                      id="wjoin-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={acctEmail}
                      onChange={(e) => setAcctEmail(e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Jméno" htmlFor="wjoin-first">
                      <Input
                        id="wjoin-first"
                        required
                        autoComplete="given-name"
                        value={acctFirstName}
                        onChange={(e) => setAcctFirstName(e.target.value)}
                      />
                    </Field>
                    <Field label="Příjmení" htmlFor="wjoin-last">
                      <Input
                        id="wjoin-last"
                        required
                        autoComplete="family-name"
                        value={acctLastName}
                        onChange={(e) => setAcctLastName(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Telefon (volitelně)"
                    htmlFor="wjoin-phone"
                    hint="Necháme si ho jen pro případ, kdyby tě správce potřeboval rychle chytnout."
                  >
                    <Input
                      id="wjoin-phone"
                      type="tel"
                      autoComplete="tel"
                      value={acctPhone}
                      onChange={(e) => setAcctPhone(e.target.value)}
                    />
                  </Field>
                  {error && <Alert variant="danger">{error}</Alert>}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      loading={submitting}
                    >
                      Odeslat žádost
                    </Button>
                  </div>
                </form>
              </CardSection>
            </Card>
          )}
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
