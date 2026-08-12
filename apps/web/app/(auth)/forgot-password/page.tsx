"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, auth } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.requestPasswordReset(email);
      setSubmitted(true);
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

  if (submitted) {
    return (
      <AuthShell
        title="Zkontroluj e-mail"
        subtitle="Pokud pro tento e-mail existuje účet, poslali jsme odkaz na obnovu hesla. Platí jednu hodinu."
        footer={
          <Link href="/login" className="font-medium text-ink-900 underline">
            Zpět na přihlášení
          </Link>
        }
      >
        <p className="text-sm text-ink-500">
          Nevidíš ho? Mrkni do složky Spam, nebo za chvíli zkus znovu.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Obnova hesla"
      subtitle="Zadej svůj e-mail a pošleme ti odkaz, kde si zvolíš nové heslo."
      footer={
        <Link href="/login" className="font-medium text-ink-900 underline">
          Zpět na přihlášení
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

        {error && <Alert variant="danger">{error}</Alert>}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
        >
          {submitting ? "Odesílám…" : "Poslat odkaz"}
        </Button>
      </form>
    </AuthShell>
  );
}
