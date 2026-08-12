"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { LinkButton } from "@/components/ui/button";
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
        setMessage("E-mail je ověřený. Teď se můžeš přihlásit.");
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
  }, [token]);

  const title =
    status === "pending"
      ? "Ověřuji e-mail…"
      : status === "success"
        ? "Hotovo"
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
      {status === "pending" && (
        <div className="flex justify-center py-2">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}
      {status === "success" && (
        <LinkButton href="/login" variant="primary" size="lg" fullWidth>
          Přejít na přihlášení
        </LinkButton>
      )}
    </AuthShell>
  );
}
