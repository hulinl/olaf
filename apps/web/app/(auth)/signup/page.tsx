"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, auth } from "@/lib/api";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  // `?email=` query param se používá z RSVP success page — anon user
  // klikne "Vytvořit si tu zdarma účet" a e-mail z RSVP formuláře
  // se předvyplní. Bez Suspense wrapperu Next 16 build hodí
  // PrerenderError na useSearchParams.
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get("email") ?? "";
  // `?next=` — kam po verify email redirectovat. Signup + verify jsou
  // rozdělené flow (auth server pošle verify link mailem), takže si
  // next musíme dropnout do localStorage a verify ho vyzvedne. Origin
  // je stejný, takže to funguje pro > 90 % uživatelů (kliknou z mailu
  // ve stejném browseru). Ostatní fallnou na /dashboard.
  useEffect(() => {
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      try {
        localStorage.setItem("post_signup_next", next);
      } catch {
        // localStorage nedostupné (private mode) — smůla, fallneme na
        // /dashboard po verify.
      }
    }
  }, [searchParams]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<"created" | "takeover" | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resp = await auth.signup({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
      });
      setSuccess(resp.code ?? "created");
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

  if (success) {
    const isTakeover = success === "takeover";
    return (
      <AuthShell
        title={isTakeover ? "Vítáme tě zpátky!" : "Zkontroluj e-mail"}
        subtitle={
          isTakeover ? (
            <>
              Tuhle adresu už u nás známe z tvé předchozí registrace na
              akci. Poslali jsme na <strong>{email}</strong> ověřovací odkaz
              — po kliknutí budeš rovnou přihlášený.
            </>
          ) : (
            <>
              Poslali jsme ověřovací odkaz na <strong>{email}</strong>. Po
              kliknutí na něj budeš rovnou přihlášený, není potřeba se pak
              znovu logovat.
            </>
          )
        }
        footer={
          <Link href="/login" className="underline">
            Zpět na přihlášení
          </Link>
        }
      >
        <p className="text-sm text-ink-500">
          Odkaz platí 24 hodin. Pokud e-mail nevidíš, mrkni do složky
          Spam. Nedorazil? Na{" "}
          <Link href="/login" className="underline">
            přihlašovací stránce
          </Link>{" "}
          si můžeš nechat poslat nový.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Vytvoř si účet"
      subtitle="Přidej se ke crew. Na první akci se přihlásíš za pár minut."
      footer={
        <>
          Už máš účet?{" "}
          <Link href="/login" className="font-medium text-ink-900 underline">
            Přihlásit se
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jméno" htmlFor="first_name">
            <Input
              id="first_name"
              name="first_name"
              type="text"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Příjmení" htmlFor="last_name">
            <Input
              id="last_name"
              name="last_name"
              type="text"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>

        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Heslo"
          htmlFor="password"
          hint="Aspoň 10 znaků. Chrome / Safari ti nabídne vygenerovat silné heslo."
        >
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <Alert variant="danger">{error}</Alert>}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
        >
          {submitting ? "Zakládám účet…" : "Vytvořit účet"}
        </Button>
      </form>
    </AuthShell>
  );
}
