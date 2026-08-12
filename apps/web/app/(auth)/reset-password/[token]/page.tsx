"use client";

import Link from "next/link";
import { FormEvent, use, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, auth } from "@/lib/api";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.confirmPasswordReset(token, password);
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
        title="Heslo je změněné"
        subtitle="Teď se můžeš přihlásit s novým heslem."
      >
        <LinkButton href="/login" variant="primary" size="lg" fullWidth>
          Přejít na přihlášení
        </LinkButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Zvol si nové heslo"
      subtitle="Vyber něco, co si zapamatuješ, ale co není zřejmé."
      footer={
        <Link href="/login" className="font-medium text-ink-900 underline">
          Zpět na přihlášení
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Nové heslo"
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
          {submitting ? "Ukládám…" : "Uložit heslo"}
        </Button>
      </form>
    </AuthShell>
  );
}
