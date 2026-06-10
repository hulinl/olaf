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
 * Field with both a manual URL input and an upload button. Uploads go to the
 * block-image endpoint (POST /events/{ws}/{slug}/block-images/), NOT the
 * gallery — block images shouldn't show up in the public gallery (e.g. the
 * hero cover would otherwise appear twice). When workspaceSlug / eventSlug
 * are absent (create flow before the event exists), only the URL input is
 * offered.
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
      const res = await events.uploadBlockImage(workspaceSlug, eventSlug, file);
      if (res.url) onChange(res.url);
    } catch (err) {
      // Předtím tu byl jen generic "Upload se nepodařil." — když
      // backend vrátí 500 (nebo třeba HEIC bez pluginu, max-size 4xx
      // s konkrétním textem), user neviděl proč. Teď ukazujeme status
      // + payload, ať dokáže ohlásit reálnou chybu.
      if (err instanceof ApiError) {
        const fieldErr = err.firstFieldError();
        const detail = fieldErr ?? err.message;
        setError(
          err.status >= 500
            ? `Server vrátil chybu ${err.status}. Zkus to znovu, případně menší soubor.`
            : detail,
        );
      } else {
        setError(
          err instanceof Error
            ? `Upload se nepodařil: ${err.message}`
            : "Upload se nepodařil.",
        );
      }
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
