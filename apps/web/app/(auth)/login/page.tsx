"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, auth } from "@/lib/api";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  // Only allow same-origin relative paths so a crafted ?next= can't redirect off-site.
  const safeNext = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Když backend vrátí 403 + code=email_not_verified, místo generické
  // chyby ukážeme dedikovanou hlášku s tlačítkem „Poslat verifikaci
  // znovu". User report 2026-09-11: uživatel co prošel anon RSVP ->
  // signup zůstal zablokovaný na login page bez akce jak dál.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNeedsVerify(false);
    setResentNotice(null);
    try {
      await auth.login({ email, password });
      router.push(safeNext ?? "/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403 && err.data?.code === "email_not_verified") {
          setNeedsVerify(true);
          setError(null);
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

  async function handleResendVerify() {
    if (!email.trim()) return;
    setResending(true);
    setResentNotice(null);
    try {
      const resp = await auth.resendVerification(email.trim());
      setResentNotice(
        resp.detail ??
          "Pokud e-mail máme, poslali jsme na něj nový verifikační odkaz.",
      );
    } catch {
      setResentNotice(
        "Nepodařilo se poslat mail. Zkus to za chvíli znovu.",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Vítej zpátky"
      subtitle="Přihlaš se a spravuj své komunity a akce."
      footer={
        <>
          Ještě nemáš účet?{" "}
          <Link href="/signup" className="font-medium text-ink-900 underline">
            Vytvořit účet
          </Link>
        </>
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

        <Field
          label={
            <span className="flex items-center justify-between">
              <span>Heslo</span>
              <Link
                href="/forgot-password"
                className="text-xs font-normal text-ink-500 underline"
              >
                Zapomenuté?
              </Link>
            </span>
          }
          htmlFor="password"
        >
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <Alert variant="danger">{error}</Alert>}

        {needsVerify && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink-900">
            <p>
              <strong>Nejdřív ověř svůj e-mail.</strong> Poslali jsme ti
              potvrzovací mail — klikni v něm na odkaz a přihlas se
              znovu.
            </p>
            <p className="mt-2 text-xs text-ink-700">
              Nedorazil? Zkontroluj spam. Nebo si nech poslat nový:
            </p>
            <div className="mt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleResendVerify}
                loading={resending}
                disabled={resending || !email.trim()}
              >
                {resending ? "Odesílám…" : "Poslat verifikaci znovu"}
              </Button>
            </div>
            {resentNotice && (
              <p className="mt-2 text-xs text-ink-700">{resentNotice}</p>
            )}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
        >
          {submitting ? "Přihlašuji…" : "Přihlásit se"}
        </Button>
      </form>
    </AuthShell>
  );
}
