"use client";

import { useRef, useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { ApiError, assetUrl, events } from "@/lib/api";

interface Props {
  label: string;
  hint?: string;
  /** Current URL (relative /media/... or absolute). Empty string = no image. */
  value: string;
  onChange: (url: string) => void;
  /** Needed to call the upload endpoint scoped to this event. */
  workspaceSlug?: string;
  eventSlug?: string;
}

/**
 * Field with both a manual URL input and an upload button. The upload reuses
 * the gallery endpoint (POST /events/{ws}/{slug}/images/) which writes into
 * event.images — that means uploaded block images are listed alongside the
 * gallery, owners can reuse them across blocks, and orphan cleanup is a
 * single concern. When workspaceSlug / eventSlug are absent (create flow
 * before the event exists), only the URL input is offered.
 */
export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  workspaceSlug,
  eventSlug,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpload = Boolean(workspaceSlug && eventSlug);
  const preview = assetUrl(value || null);

  async function handleFile(file: File | null) {
    if (!file || !workspaceSlug || !eventSlug) return;
    setBusy(true);
    setError(null);
    try {
      const img = await events.uploadImage(workspaceSlug, eventSlug, file);
      if (img.url) onChange(img.url);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Upload se nepodařil.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {preview && (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt=""
              className="h-20 w-32 shrink-0 rounded-md border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="self-start text-xs text-ink-500 hover:text-danger"
            >
              Odstranit
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={canUpload ? "URL nebo nahraj soubor →" : "https://…/foto.jpg"}
          />
          {canUpload && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50 focus-ring"
              >
                {busy ? "Nahrávám…" : "Nahrát"}
              </button>
            </>
          )}
        </div>
        {!canUpload && (
          <p className="text-xs text-ink-500">
            Upload bude dostupný po prvním uložení akce.
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Field>
  );
}
