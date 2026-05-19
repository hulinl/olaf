"use client";

import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  type RSVPDocumentsBundle,
  assetUrl,
  events,
} from "@/lib/api";

interface Props {
  workspaceSlug: string;
  eventSlug: string;
}

/**
 * Participant-side panel for required documents. Hides itself when:
 *  - user is anonymous (no RSVP → 404 from /rsvp/documents/),
 *  - the event has no required_documents,
 *  - or the API otherwise can't load (silent).
 *
 * Each required document row shows the current uploaded file (if any)
 * with a "nahrát jiné" + "smazat" action, or an upload prompt if not.
 * Verified files are read-only.
 */
export function RequiredDocsPanel({ workspaceSlug, eventSlug }: Props) {
  const [bundle, setBundle] = useState<RSVPDocumentsBundle | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const next = await events.myDocuments(workspaceSlug, eventSlug);
      setBundle(next);
    } catch (err) {
      if (err instanceof ApiError) setHidden(true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, eventSlug]);

  if (hidden || !bundle || bundle.required.length === 0) return null;

  async function handleUpload(key: string, file: File) {
    setBusyKey(key);
    setError(null);
    try {
      await events.uploadDocument(workspaceSlug, eventSlug, key, file);
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Upload selhal.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Smazat dokument?")) return;
    setBusyKey(`del-${id}`);
    try {
      await events.deleteDocument(workspaceSlug, eventSlug, id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-base font-semibold text-ink-900">
        Požadované dokumenty
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        Pro účast je potřeba doložit. Nahraj soubor (PDF / obrázek).
      </p>

      {error && (
        <p className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {bundle.required.map((spec) => {
          const uploaded = bundle.uploaded.find((u) => u.key === spec.key);
          return (
            <DocRow
              key={spec.key}
              label={spec.label}
              required={spec.required}
              uploaded={uploaded}
              busy={busyKey === spec.key}
              busyDelete={
                uploaded ? busyKey === `del-${uploaded.id}` : false
              }
              onPick={(file) => handleUpload(spec.key, file)}
              onDelete={uploaded ? () => handleDelete(uploaded.id) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

function DocRow({
  label,
  required,
  uploaded,
  busy,
  busyDelete,
  onPick,
  onDelete,
}: {
  label: string;
  required: boolean;
  uploaded?: {
    id: number;
    url: string | null;
    original_name: string;
    uploaded_at: string;
    verified_at: string | null;
  };
  busy: boolean;
  busyDelete: boolean;
  onPick: (file: File) => void;
  onDelete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const verified = !!uploaded?.verified_at;
  const fileUrl = uploaded?.url ? assetUrl(uploaded.url) : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium text-ink-900">
          {label}
          {required && <span className="ml-1 text-danger">*</span>}
        </p>
        {uploaded ? (
          <p className="truncate text-xs text-ink-500">
            {uploaded.original_name || "soubor"}
            {fileUrl && (
              <>
                {" · "}
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-900"
                >
                  stáhnout
                </a>
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-ink-500">Zatím nenahráno.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {/* Status pill — mirrors the payment panel's badge so the
            participant zone reads consistently from row to row. */}
        {verified ? (
          <span className="inline-flex rounded-full bg-success/20 px-3 py-0.5 text-xs font-semibold text-success">
            Ověřeno
          </span>
        ) : uploaded ? (
          <span className="inline-flex rounded-full bg-success/15 px-3 py-0.5 text-xs font-semibold text-success">
            Nahráno
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-warning/15 px-3 py-0.5 text-xs font-semibold text-warning">
            Čeká
          </span>
        )}
        {!verified && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50"
            >
              {busy
                ? "Nahrávám…"
                : uploaded
                  ? "Nahrát jiné"
                  : "Nahrát"}
            </button>
            {uploaded && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={busyDelete}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-500 hover:text-danger disabled:opacity-50"
              >
                Smazat
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
