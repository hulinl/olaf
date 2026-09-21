"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  type Community,
  type CommunityMemberStatus,
  auth,
  communities as communitiesApi,
} from "@/lib/api";

interface Props {
  workspaceSlug: string;
  communitySlug: string;
  visibility: Community["visibility"];
  myMembership: Community["my_membership"];
}

type AuthState = "loading" | "anon" | "auth";

export function JoinCommunityCTA({
  workspaceSlug,
  communitySlug,
  visibility,
  myMembership,
}: Props) {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [status, setStatus] = useState<CommunityMemberStatus | null>(
    myMembership?.status ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleJoin() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await communitiesApi.join(workspaceSlug, communitySlug);
      // Server odpovídá `pending` | `already_pending` | `already_member`.
      // Všechny tři mapujeme na aktuální stav členství, aby UI hned
      // reflektovalo pravdu (žádný race s dvojklikem).
      setStatus(result.membership.status);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(
          "Do této komunity se nelze samostatně přihlásit. Kontaktuj správce.",
        );
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Přihlášení se nepodařilo, zkus to prosím znovu.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Unlisted / private: žádné self-serve CTA, jen informativní box.
  if (visibility !== "public") {
    return (
      <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink-900">
          Neveřejná komunita
        </h2>
        <p className="mt-2 text-sm text-ink-700">
          Do této komunity tě musí přidat správce ručně. Ozvi se pořadateli.
        </p>
      </div>
    );
  }

  // Loading skeleton pro auth state, ať se CTA nemihne mezi variantami.
  if (authState === "loading") {
    return (
      <div className="h-24 max-w-lg animate-pulse rounded-2xl border border-border bg-surface-muted/60" />
    );
  }

  if (authState === "anon") {
    const next = encodeURIComponent(`/${workspaceSlug}/k/${communitySlug}`);
    return (
      <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink-900">
          Přidej se ke komunitě
        </h2>
        <p className="mt-2 text-sm text-ink-700">
          Přihlas se do OLAFu a pošli žádost o vstup. Správce ji buď schválí,
          nebo zamítne.
        </p>
        <div className="mt-4">
          <Link
            href={`/login?next=${next}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
          >
            Přihlásit se a požádat o vstup
          </Link>
        </div>
      </div>
    );
  }

  // Auth user — přizpůsobit dle statusu.
  if (status === "member") {
    return (
      <div className="max-w-lg rounded-2xl border border-success/30 bg-success/10 p-6">
        <h2 className="text-base font-semibold text-ink-900">
          Jsi členem komunity
        </h2>
        <p className="mt-1 text-sm text-ink-700">
          Máš přístup ke všem komunitním akcím a aktualitám.
        </p>
      </div>
    );
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

  // Auth user bez členství (nebo declined / removed → server umí re-request).
  return (
    <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold text-ink-900">
        Přidej se ke komunitě
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
          onClick={handleJoin}
          loading={submitting}
        >
          Přidat se ke komunitě
        </Button>
      </div>
    </div>
  );
}
