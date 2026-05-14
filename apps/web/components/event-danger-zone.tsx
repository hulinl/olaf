"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type Event, events } from "@/lib/api";

interface Props {
  event: Event;
  workspaceSlug: string;
  onCancelled: (updated: Event) => void;
}

export function EventDangerZone({ event, workspaceSlug, onCancelled }: Props) {
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (event.status === "cancelled") {
    return (
      <Card className="border-danger/30">
        <CardSection>
          <h2 className="text-base font-semibold text-danger">
            Akce je zrušena
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Stav: <strong>cancelled</strong>. Všem registrovaným byl odeslán
            zrušovací email.
          </p>
          {event.cancellation_reason && (
            <div className="mt-3 rounded-md border border-border bg-surface-muted/40 p-3 text-sm text-ink-700">
              <strong>Důvod:</strong> {event.cancellation_reason}
            </div>
          )}
        </CardSection>
      </Card>
    );
  }

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await events.cancel(workspaceSlug, event.slug, reason);
      onCancelled(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Zrušení akce se nepovedlo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-danger/30">
      <CardSection>
        <h2 className="text-base font-semibold text-danger">Zrušit akci</h2>
        <p className="mt-1 text-sm text-ink-700">
          Po zrušení dostanou všichni přihlášení i lidé na waitlistu email s
          informací (a tvým důvodem, pokud ho napíšeš). Veřejná stránka akce
          zůstane viditelná, ale s banner „ZRUŠENO".
        </p>

        {!opened ? (
          <Button
            type="button"
            variant="danger"
            size="md"
            className="mt-4"
            onClick={() => setOpened(true)}
          >
            Zrušit akci…
          </Button>
        ) : (
          <div className="mt-5 flex flex-col gap-4 rounded-md border border-danger/30 bg-danger-soft/40 p-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-900">
                Důvod (volitelně)
              </span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="např. blíží se bouřka, přesouváme termín…"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
              <span className="text-xs text-ink-500">
                Zobrazí se v emailu i na veřejné stránce akce.
              </span>
            </label>

            {error && <Alert variant="danger">{error}</Alert>}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="danger"
                size="md"
                loading={submitting}
                onClick={handleCancel}
              >
                {submitting ? "Ruším akci…" : "Definitivně zrušit"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => {
                  setOpened(false);
                  setReason("");
                  setError(null);
                }}
                disabled={submitting}
              >
                Ne, ponechat
              </Button>
            </div>
          </div>
        )}
      </CardSection>
    </Card>
  );
}
