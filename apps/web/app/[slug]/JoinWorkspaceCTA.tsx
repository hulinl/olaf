"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { InlineLoginDialog } from "@/components/inline-login-dialog";
import { Alert } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type User,
  type Workspace,
  auth,
  workspaces as workspacesApi,
} from "@/lib/api";

interface Props {
  workspaceSlug: string;
  workspaceName: string;
  visibility: Workspace["visibility"];
  myMembership: Workspace["my_membership"];
}

type AuthState = "loading" | "anon" | "auth";
type MembershipStatus = "active" | "pending" | "removed";

export function JoinWorkspaceCTA({
  workspaceSlug,
  workspaceName,
  visibility,
  myMembership,
}: Props) {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [status, setStatus] = useState<MembershipStatus | null>(
    myMembership?.status ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [acctEmail, setAcctEmail] = useState("");
  const [acctFirstName, setAcctFirstName] = useState("");
  const [acctLastName, setAcctLastName] = useState("");
  const [acctPhone, setAcctPhone] = useState("");

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginPrefillEmail, setLoginPrefillEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    auth
      .me()
      .then(() => {
        if (!cancelled) setAuthState("auth");
      })
      .catch(() => {
        if (!cancelled) setAuthState("anon");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const result = await workspacesApi.join(workspaceSlug, account);
      // Server odpovídá pending | already_pending | already_member.
      setStatus(result.membership.status);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(
          "Do této komunity se nelze samostatně přihlásit. Kontaktuj správce.",
        );
      } else if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.data?.code === "email_has_account"
      ) {
        setLoginPrefillEmail(account?.email ?? "");
        setLoginDialogOpen(true);
      } else {
        setError(
          err instanceof ApiError
            ? (err.firstFieldError() ?? err.message)
            : "Přihlášení se nepodařilo, zkus to prosím znovu.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleAnonSubmit(e: FormEvent) {
    e.preventDefault();
    submitJoin({
      email: acctEmail.trim(),
      first_name: acctFirstName.trim(),
      last_name: acctLastName.trim(),
      phone: acctPhone.trim() || undefined,
    });
  }

  async function handleLoginSuccess(user: User) {
    setLoginDialogOpen(false);
    setAuthState("auth");
    if (acctEmail && acctEmail.trim().toLowerCase() !== user.email) {
      // Ne-match — nechme ho kliknout znovu, ať nedáme cizímu jménu
      // cizí přihlášku.
      return;
    }
    await submitJoin();
  }

  // Anonymní hero se u ne-public workspacu nezobrazuje vůbec (backend
  // by beztak vrátil 403). Pro authenticated se skryjeme (nemá smysl).
  if (visibility !== "public") {
    return null;
  }

  if (authState === "loading") {
    return (
      <div className="h-24 max-w-lg animate-pulse rounded-2xl border border-border bg-surface-muted/60" />
    );
  }

  if (authState === "anon") {
    if (status === "pending") {
      return (
        <div className="max-w-lg space-y-4">
          <div className="rounded-2xl border border-success/30 bg-success/10 p-6">
            <h2 className="text-base font-semibold text-ink-900">
              Žádost odeslána — čeká na schválení
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              Poslali jsme ti potvrzení na e-mail. Až tvojí žádost správce
              schválí, dáme vědět.
            </p>
          </div>
          <div className="rounded-2xl border border-brand/30 bg-brand/5 p-5 text-left">
            <h3 className="text-base font-semibold text-ink-900">
              Dokonči registraci — nastav si účet
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              Zvládneš to za 30 vteřin. Uvidíš všechny komunity a akce, ve
              kterých jsi, na jednom místě.
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
        </div>
      );
    }

    return (
      <>
        <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink-900">
            Přidej se do komunity {workspaceName}
          </h2>
          <p className="mt-2 text-sm text-ink-700">
            Vyplň základní údaje a pošli žádost. Správce ji buď schválí,
            nebo zamítne. Po odeslání ti nabídneme dokončení účtu —
            přihlášky pak budeš mít pod kontrolou z jednoho místa.
          </p>
          <form
            onSubmit={handleAnonSubmit}
            className="mt-4 flex flex-col gap-3"
          >
            <Field label="E-mail" htmlFor="ws-join-email">
              <Input
                id="ws-join-email"
                type="email"
                required
                autoComplete="email"
                value={acctEmail}
                onChange={(e) => setAcctEmail(e.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jméno" htmlFor="ws-join-first">
                <Input
                  id="ws-join-first"
                  required
                  autoComplete="given-name"
                  value={acctFirstName}
                  onChange={(e) => setAcctFirstName(e.target.value)}
                />
              </Field>
              <Field label="Příjmení" htmlFor="ws-join-last">
                <Input
                  id="ws-join-last"
                  required
                  autoComplete="family-name"
                  value={acctLastName}
                  onChange={(e) => setAcctLastName(e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Telefon (volitelně)"
              htmlFor="ws-join-phone"
              hint="Necháme si ho jen pro případ, kdyby tě správce potřeboval rychle chytnout."
            >
              <Input
                id="ws-join-phone"
                type="tel"
                autoComplete="tel"
                value={acctPhone}
                onChange={(e) => setAcctPhone(e.target.value)}
              />
            </Field>
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setLoginPrefillEmail(acctEmail);
                  setLoginDialogOpen(true);
                }}
                className="text-sm text-ink-500 underline underline-offset-2 hover:text-ink-700"
              >
                Už mám účet — přihlásit se
              </button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
              >
                Přidat se do komunity
              </Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-ink-500">
            Zapomenuté heslo? Použij odkaz{" "}
            <Link
              href="/forgot-password"
              className="underline"
              target="_blank"
            >
              obnovit heslo
            </Link>
            .
          </p>
        </div>
        <InlineLoginDialog
          open={loginDialogOpen}
          initialEmail={loginPrefillEmail}
          onClose={() => setLoginDialogOpen(false)}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  if (status === "active") {
    // Owner/admin/member už tam je — CTA schováme (owner cockpit link
    // je v headeru přes OwnerCockpitLink).
    return null;
  }

  if (status === "pending") {
    return (
      <div className="max-w-lg rounded-2xl border border-warning/40 bg-warning/10 p-6">
        <h2 className="text-base font-semibold text-ink-900">
          Čekáš na schválení
        </h2>
        <p className="mt-1 text-sm text-ink-700">
          Tvoji žádost o vstup teď posuzuje správce komunity. Až rozhodne,
          přijde ti upozornění.
        </p>
      </div>
    );
  }

  // Authenticated user bez členství (nebo removed → server umí re-request).
  return (
    <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold text-ink-900">
        Přidej se do komunity {workspaceName}
      </h2>
      <p className="mt-2 text-sm text-ink-700">
        Klikni níž a pošli žádost o vstup. Správce ji obratem uvidí ve svém
        cockpitu a schválí nebo zamítne.
      </p>
      {error && (
        <div className="mt-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-4">
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => submitJoin()}
          loading={submitting}
        >
          Přidat se do komunity
        </Button>
      </div>
    </div>
  );
}
