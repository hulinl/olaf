"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { ApiError, auth } from "@/lib/api";

type Status = "pending" | "success" | "error";

export default function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState<string>("Verifying your email…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await auth.verifyEmail(token);
        if (cancelled) return;
        setStatus("success");
        setMessage("Email verified. You can now log in.");
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

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold">
          {status === "pending" && "Verifying…"}
          {status === "success" && "All set"}
          {status === "error" && "Verification failed"}
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">{message}</p>
        {status !== "pending" && (
          <Link
            href="/login"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to login
          </Link>
        )}
      </div>
    </main>
  );
}
