"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
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
      <AuthShell
        title="Check your email"
        subtitle="If an account exists for that email, we've sent a reset link. It expires in one hour."
        footer={
          <Link href="/login" className="font-medium text-ink-900 underline">
            Back to log in
          </Link>
        }
      >
        <p className="text-sm text-ink-500">
          Don&apos;t see it? Check your spam folder, or wait a minute and try
          again.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a link to choose a new one."
      footer={
        <Link href="/login" className="font-medium text-ink-900 underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {error && <Alert variant="danger">{error}</Alert>}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
        >
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
