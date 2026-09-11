"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { ApiError, auth } from "@/lib/api";

type Status = "pending" | "success" | "error";

export default function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState<string>(
    "Chviličku — ověřujeme tvůj e-mail.",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await auth.verifyEmail(token);
        if (cancelled) return;
        setStatus("success");
        setMessage("Hotovo, přesouváme tě do aplikace…");
        // Auto-login: backend nastavuje session přímo na verify (viz
        // accounts.views.verify_email 2026-09-11). Přesměrujeme
        // rovnou do dashboardu, ať user nemusí znovu zadávat heslo.
        // Redirect přes plné navigation (assign) — SPA push by
        // nepřevzalo novou session cookie do fetch layeru.
        setTimeout(() => {
          if (!cancelled) window.location.assign("/dashboard");
        }, 400);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        if (err instanceof ApiError) {
          setMessage(err.message);
        } else {
          setMessage("Ověření se nepovedlo. Odkaz asi vypršel.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // router není v deps záměrně — cíl je jednorázový verify při mountu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const title =
    status === "pending"
      ? "Ověřuji e-mail…"
      : status === "success"
        ? "Vítej!"
        : "Ověření se nepovedlo";

  return (
    <AuthShell
      title={title}
      subtitle={message}
      footer={
        status === "error" ? (
          <Link
            href="/signup"
            className="font-medium text-ink-900 underline"
          >
            Zkusit registraci znovu
          </Link>
        ) : null
      }
    >
      {(status === "pending" || status === "success") && (
        <div className="flex justify-center py-2">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}
    </AuthShell>
  );
}
