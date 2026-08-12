"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
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

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.signup({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
      });
      setSuccess(true);
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
    return (
      <AuthShell
        title="Zkontroluj e-mail"
        subtitle={
          <>
            Poslali jsme ověřovací odkaz na <strong>{email}</strong>. Klikni
            na něj a účet ti aktivujeme.
          </>
        }
        footer={
          <Link href="/login" className="underline">
            Zpět na přihlášení
          </Link>
        }
      >
        <p className="text-sm text-ink-500">
          Odkaz platí 24 hodin. Pokud e-mail nevidíš, mrkni do složky
          Spam.
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
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Heslo"
          htmlFor="password"
          hint="Aspoň 10 znaků, s písmenem a číslicí."
        >
          <Input
            id="password"
            type="password"
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
