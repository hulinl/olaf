"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, workspaces } from "@/lib/api";

interface Props {
  open: boolean;
  workspaceSlug: string;
  workspaceName: string;
  onClose: () => void;
}

/**
 * Kontaktní formulář pro public stránku komunity.
 *
 * Pattern: na public stránce klikneš na e-mailovou ikonu → vyskočí
 * tenhle modal. Owner-ová e-mailová adresa se NIKDY nevystaví ve
 * vrácených datech, takže bot scraper si ji nestáhne. User vyplní
 * jméno + e-mail + zprávu, backend pošle owner-ovi mail s replyTo
 * = userův e-mail.
 *
 * Rate limit a basic spam-protekce řeší backend
 * (`POST /api/workspaces/<slug>/contact/`).
 */
export function WorkspaceContactDialog({
  open,
  workspaceSlug,
  workspaceName,
  onClose,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setMessage("");
      setError(null);
      setSent(false);
    }
  }, [open]);

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
      await workspaces.sendContactMessage(workspaceSlug, {
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.firstFieldError() ?? err.message);
      } else {
        setError("Odeslání se nepodařilo. Zkus to prosím znovu.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2
            id="contact-dialog-title"
            className="text-lg font-semibold text-ink-900"
          >
            Napsat komunitě {workspaceName}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Zpráva odejde rovnou na e-mail správci komunity. Adresu
            nikde nezveřejňujeme.
          </p>
        </div>
        {sent ? (
          <>
            <Alert variant="success">
              Zpráva odeslána. Brzy se ti správce ozve na uvedený
              e-mail.
            </Alert>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onClose}
              >
                Zavřít
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Field label="Tvé jméno" htmlFor="contact-name">
              <Input
                id="contact-name"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="E-mail (kam přijde odpověď)" htmlFor="contact-email">
              <Input
                id="contact-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Zpráva" htmlFor="contact-message">
              <textarea
                id="contact-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="O co se zajímáš? Máš dotaz na konkrétní akci, nebo se chceš zapojit?"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
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
                {submitting ? "Odesílám…" : "Odeslat zprávu"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
