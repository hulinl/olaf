"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { ApiError, auth } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.firstFieldError() ?? err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            If an account exists for that email, we&apos;ve sent a reset link.
            It expires in one hour.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block text-sm text-zinc-900 underline dark:text-zinc-100"
          >
            Back to log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a link to choose a new
          password.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          {error && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>

          <Link
            href="/login"
            className="text-center text-sm text-zinc-600 underline dark:text-zinc-400"
          >
            Back to log in
          </Link>
        </form>
      </div>
    </main>
  );
}
