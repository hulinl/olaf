"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type EventImage,
  type Workspace,
  assetUrl,
  auth,
  events,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

const MAX_IMAGES = 20;

export default function EventGalleryPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [images, setImages] = useState<EventImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev, imgs] = await Promise.all([
          workspaces.detail(wsSlug),
          events.publicEvent(wsSlug, eventSlug),
          events.listImages(wsSlug, eventSlug),
        ]);
        if (cancelled) return;
        if (!ev.i_am_owner) {
          try {
            await auth.me();
            router.replace(`/${wsSlug}/e/${eventSlug}`);
          } catch {
            router.replace(
              `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/galerie`,
            );
          }
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
        setImages(imgs);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/galerie`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/eventy");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wsSlug, eventSlug, router]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setError(null);
    setUploading(true);
    setUploadTotal(list.length);
    setUploadDone(0);
    try {
      // Sequential upload — keeps server order predictable. Each
      // image appears in the grid as soon as its POST completes so
      // the user gets continuous visual feedback during the run.
      for (let i = 0; i < list.length; i++) {
        const img = await events.uploadImage(wsSlug, eventSlug, list[i]);
        setImages((prev) => [...prev, img]);
        setUploadDone(i + 1);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Upload selhal.",
      );
    } finally {
      setUploading(false);
      setUploadTotal(0);
      setUploadDone(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(img: EventImage) {
    if (!confirm("Smazat obrázek?")) return;
    setBusy(img.id);
    setError(null);
    try {
      await events.deleteImage(wsSlug, eventSlug, img.id);
      setImages((prev) => prev.filter((i) => i.id !== img.id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Mazání selhalo.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function move(img: EventImage, direction: -1 | 1) {
    const idx = images.findIndex((i) => i.id === img.id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= images.length) return;
    const next = [...images];
    [next[idx], next[target]] = [next[target], next[idx]];
    setImages(next);
    setBusy(img.id);
    setError(null);
    try {
      const updated = await events.reorderImages(
        wsSlug,
        eventSlug,
        next.map((i) => i.id),
      );
      setImages(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Přerovnání selhalo.",
      );
      // Roll back optimistic move
      setImages(images);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  if (!workspace || !event) return null;

  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="flex flex-col gap-6">
      {/* Sticky upload banner — when you fire off 8 phone photos the
          POST queue takes a while; without persistent feedback users
          assume the page is dead and won't dare navigate. */}
      {uploading && (
        <div className="sticky top-16 z-20 flex flex-col gap-2 rounded-md border border-brand/40 bg-canvas/95 p-3 shadow-md backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink-900">
              Nahrávám obrázky…
            </p>
            <p className="text-xs tabular-nums text-ink-500">
              {uploadDone} / {uploadTotal}
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full bg-brand transition-[width] duration-300"
              style={{
                width: `${
                  uploadTotal === 0
                    ? 0
                    : Math.round((uploadDone / uploadTotal) * 100)
                }%`,
              }}
            />
          </div>
          <p className="text-[11px] text-ink-500">
            Můžeš počkat tady, nebo dál pracovat — fotky se nahrávají na
            pozadí. Stránku ale nezavírej, dokud bar nedoběhne.
          </p>
        </div>
      )}

      <Breadcrumbs
        items={[
          { label: "Akce", href: "/admin/eventy" },
          {
            label: event.title,
            href: `/admin/eventy/${wsSlug}/${eventSlug}/edit`,
          },
          { label: "Galerie" },
        ]}
      />

      <header>
        <p className="text-sm font-medium text-brand">Galerie</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          {event.title}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Nahraj až {MAX_IMAGES} obrázků (5 MB každý). Zobrazí se jako grid na
          veřejné stránce akce. Pořadí změníš tlačítky ↑/↓.
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          id="image-upload"
          disabled={uploading || atLimit}
        />
        <label
          htmlFor="image-upload"
          className={[
            "inline-flex cursor-pointer items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover focus-ring",
            uploading || atLimit ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
        >
          {uploading
            ? `Nahrávám ${uploadDone} / ${uploadTotal}…`
            : atLimit
              ? `Plno (${MAX_IMAGES} max)`
              : "+ Nahrát obrázky"}
        </label>
        <span className="text-sm text-ink-500">
          {images.length} / {MAX_IMAGES} obrázků
        </span>
      </div>

      {images.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-12 text-center">
          <p className="text-sm text-ink-500">
            Zatím prázdno. Klikni „+ Nahrát obrázky".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => {
            const src = assetUrl(img.url);
            const isFirst = i === 0;
            const isLast = i === images.length - 1;
            const isBusy = busy === img.id;
            return (
              <div
                key={img.id}
                className="group relative overflow-hidden rounded-md border border-border bg-surface"
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={img.alt_text}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-surface-muted" />
                )}
                <div
                  className={[
                    "absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2 text-white transition-opacity",
                    isBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                >
                  <div className="flex gap-1">
                    <IconButton
                      onClick={() => move(img, -1)}
                      disabled={isFirst || isBusy}
                      label="Posunout doleva"
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      onClick={() => move(img, 1)}
                      disabled={isLast || isBusy}
                      label="Posunout doprava"
                    >
                      ↓
                    </IconButton>
                  </div>
                  <IconButton
                    onClick={() => handleDelete(img)}
                    disabled={isBusy}
                    label="Smazat obrázek"
                    variant="danger"
                  >
                    ×
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  label,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold transition-colors disabled:opacity-30",
        variant === "danger"
          ? "bg-danger/90 hover:bg-danger"
          : "bg-white/15 hover:bg-white/25",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
