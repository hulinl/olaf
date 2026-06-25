"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import {
  ApiError,
  auth,
  type User,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * /invitations/[token] — accept-page for an owner-initiated e-mail
 * invitation. Three states: invitation expired/cancelled, viewer
 * needs to log in (or sign up with the invited e-mail), or ready
 * to accept.
 */
export default function InvitationAcceptPage({ params }: Props) {
  const { token } = use(params);
  const router = useRouter();
  const [data, setData] = useState<{
    email: string;
    status: string;
    workspace: { slug: string; name: string; bio: string };
    invited_by_name: string;
  } | null>(null);
  const [me, setMe] = useState<User | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      workspaces.lookupInvitation(token).catch(() => null),
      auth.me().catch(() => null),
    ]).then(([d, u]) => {
      if (cancelled) return;
      if (!d) setNotFound(true);
      else setData(d);
      setMe(u);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await workspaces.acceptInvitation(token);
      router.push(`/${r.workspace_slug}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Přijetí selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <PageShell>
        <h1 className="text-2xl font-semibold text-ink-900">
          Pozvánka neexistuje
        </h1>
        <p className="mt-2 text-ink-500">
          Odkaz mohl být zneplatněn nebo už byl použit. Pokud čekáš
          pozvánku do konkrétní komunity, popros pořadatele o nový
          odkaz — staré linky vypršely.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            Zpět na hlavní stránku
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:opacity-90 focus-ring"
          >
            Přihlásit se
          </Link>
        </div>
      </PageShell>
    );
  }
  if (!data) {
    return (
      <PageShell>
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      </PageShell>
    );
  }

  if (data.status !== "pending") {
    return (
      <PageShell>
        <h1 className="text-2xl font-semibold text-ink-900">
          Pozvánka už není platná
        </h1>
        <p className="mt-2 text-ink-500">
          Pozvánka pro <strong>{data.email}</strong> do{" "}
          <strong>{data.workspace.name}</strong> byla{" "}
          {data.status === "accepted" ? "přijata" : "zrušena"}.
        </p>
        <Link
          href={`/${data.workspace.slug}`}
          className="mt-4 inline-flex text-brand hover:underline"
        >
          Otevřít komunitu →
        </Link>
      </PageShell>
    );
  }

  const next = `/invitations/${token}`;
  const emailMismatch =
    me !== null && me !== undefined && me.email.toLowerCase() !== data.email.toLowerCase();

  return (
    <PageShell>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        Pozvánka do komunity
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        {data.workspace.name}
      </h1>
      {data.invited_by_name && (
        <p className="mt-2 text-ink-700">
          Pozval/a tě <strong>{data.invited_by_name}</strong>
        </p>
      )}
      {data.workspace.bio && (
        <p className="mt-3 whitespace-pre-wrap text-ink-700">
          {data.workspace.bio}
        </p>
      )}
      <p className="mt-4 text-sm text-ink-500">
        Pozvánka je pro <strong>{data.email}</strong>.
      </p>

      {error && (
        <div className="mt-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {me === undefined ? (
          <span className="text-sm text-ink-500">Načítám…</span>
        ) : me === null ? (
          <>
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90 focus-ring"
            >
              Přihlásit se
            </Link>
            <Link
              href={`/register?next=${encodeURIComponent(next)}&email=${encodeURIComponent(data.email)}`}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
            >
              Vytvořit účet
            </Link>
          </>
        ) : emailMismatch ? (
          <Alert variant="danger">
            Jsi přihlášený/á jako <strong>{me.email}</strong>, ale pozvánka
            je pro <strong>{data.email}</strong>. Odhlas se a přihlas pod
            správným e-mailem.
          </Alert>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={busy}
            onClick={accept}
          >
            {busy ? "..." : "Přijmout pozvánku"}
          </Button>
        )}
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink-900">
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <PublicAuthIndicator />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-12">
        {children}
      </main>
    </div>
  );
}
