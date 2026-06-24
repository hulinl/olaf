"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, type User, auth } from "@/lib/api";

interface Props {
  open: boolean;
  /** Pre-fill e-mailem ze stránky, ze které dialog vyskočil — typicky
   *  ten samý, ze kterého padl 409 (email_has_account). User nemusí
   *  vyplňovat dvakrát. */
  initialEmail?: string;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

/**
 * Modal login pro flow „už mám účet" v rámci RSVP formuláře.
 *
 * Bez tohohle dialogu user dostal 409 "Tento e-mail už má účet. Přihlas
 * se…" a neměl kam — musel ručně otevřít /login na druhé záložce,
 * tam se přihlásit, vrátit se na RSVP, znovu vyplnit form. Tohle ho
 * nechá přihlásit in-place a parent stránce předá `User`, takže může
 * doplnit profilová data do formuláře.
 */
export function InlineLoginDialog({
  open,
  initialEmail,
  onClose,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail ?? "");
      setPassword("");
      setError(null);
    }
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await auth.login({ email, password });
      onSuccess(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.firstFieldError() ?? err.message);
      } else {
        setError("Přihlášení se nepodařilo. Zkus to prosím znovu.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inline-login-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2
            id="inline-login-title"
            className="text-lg font-semibold text-ink-900"
          >
            Přihlásit se
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Po přihlášení doplníme tvoje údaje do formuláře, ty si je
            zkontroluješ a registraci dokončíš.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="E-mail" htmlFor="inline-login-email">
            <Input
              id="inline-login-email"
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
                  target="_blank"
                >
                  Zapomenuté heslo?
                </Link>
              </span>
            }
            htmlFor="inline-login-password"
          >
            <Input
              id="inline-login-password"
              type="password"
              required
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={submitting}
            >
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={submitting}
            >
              {submitting ? "Přihlašuji…" : "Přihlásit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
