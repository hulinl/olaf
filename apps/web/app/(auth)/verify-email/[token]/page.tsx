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
    "Hold on a sec — confirming your email.",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await auth.verifyEmail(token);
        if (cancelled) return;
        setStatus("success");
        setMessage("Email verified. You can now sign in.");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        if (err instanceof ApiError) {
          setMessage(err.message);
        } else {
          setMessage("Verification failed. The link may be expired.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const title =
    status === "pending"
      ? "Verifying your email…"
      : status === "success"
        ? "All set"
        : "Verification failed";

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
            Try signing up again
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
          Go to login
        </LinkButton>
      )}
    </AuthShell>
  );
}
