"use client";

import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useRef, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type Workspace,
  type WorkspaceWritePayload,
  assetUrl,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

const SOCIAL_KEYS: { key: string; label: string; placeholder: string }[] = [
  { key: "web", label: "Web", placeholder: "https://olafadventures.com" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/olafadventures" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/olafadventures" },
  { key: "strava", label: "Strava", placeholder: "https://strava.com/clubs/olafadventures" },
  { key: "email", label: "Email", placeholder: "ahoj@olafadventures.com" },
];

const VISIBILITY_OPTIONS: {
  value: Workspace["visibility"];
  label: string;
  hint: string;
}[] = [
  {
    value: "public",
    label: "Veřejná",
    hint: "Najdou tě i bez odkazu — komunita je listovaná na platformě.",
  },
  {
    value: "unlisted",
    label: "Skrytá",
    hint: "Dostane se k tobě jen ten, komu pošleš odkaz.",
  },
  {
    value: "private",
    label: "Soukromá",
    hint: "Profil i akce jsou viditelné jen členům komunity.",
  },
];

export default function WorkspaceEditPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [visibility, setVisibility] = useState<Workspace["visibility"]>("public");
  const [defaultTz, setDefaultTz] = useState("Europe/Prague");
  const [accentColor, setAccentColor] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .detail(slug)
      .then((ws) => {
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/workspaces/${slug}`);
          return;
        }
        setWorkspace(ws);
        setName(ws.name);
        setBio(ws.bio ?? "");
        setLocation(ws.location ?? "");
        setVisibility(ws.visibility);
        setDefaultTz(ws.default_tz ?? "Europe/Prague");
        setAccentColor(ws.accent_color ?? "");
        setSocials(ws.social_links ?? {});
        setLogoUrl(ws.logo_url);
        setCoverUrl(ws.cover_url);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/workspaces");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  function updateSocial(key: string, value: string) {
    setSocials((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoPick(file: File | null) {
    if (!file) return;
    setLogoBusy(true);
    setError(null);
    try {
      const updated = await workspaces.uploadLogo(slug, file);
      setLogoUrl(updated.logo_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.firstFieldError() ?? err.message : "Upload selhal.");
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    if (!confirm("Smazat logo?")) return;
    setLogoBusy(true);
    setError(null);
    try {
      const updated = await workspaces.deleteLogo(slug);
      setLogoUrl(updated.logo_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleCoverPick(file: File | null) {
    if (!file) return;
    setCoverBusy(true);
    setError(null);
    try {
      const updated = await workspaces.uploadCover(slug, file);
      setCoverUrl(updated.cover_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.firstFieldError() ?? err.message : "Upload selhal.");
    } finally {
      setCoverBusy(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function handleCoverRemove() {
    if (!confirm("Smazat úvodní fotku?")) return;
    setCoverBusy(true);
    setError(null);
    try {
      const updated = await workspaces.deleteCover(slug);
      setCoverUrl(updated.cover_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      // Strip empty social entries so the JSON stays tidy.
      const cleanSocials: Record<string, string> = {};
      for (const [k, v] of Object.entries(socials)) {
        if (v.trim()) cleanSocials[k.trim().toLowerCase()] = v.trim();
      }
      const payload: WorkspaceWritePayload = {
        name,
        bio,
        location,
        visibility,
        default_tz: defaultTz,
        accent_color: accentColor,
        social_links: cleanSocials,
      };
      const updated = await workspaces.update(slug, payload);
      setWorkspace(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.firstFieldError() ?? err.message : "Uložení selhalo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }
  if (!workspace) return null;

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Komunity", href: "/workspaces" },
            { label: workspace.name, href: `/workspaces/${slug}` },
            { label: "Upravit komunitu" },
          ]}
        />

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            Upravit profil komunity
          </h1>
          <p className="mt-2 text-ink-500">
            Co tady nastavíš, uvidí návštěvníci na veřejné stránce{" "}
            <strong>/{slug}</strong>.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">Základní info</h2>
              <div className="mt-5 flex flex-col gap-4">
                <Field label="Název komunity *" htmlFor="name">
                  <Input
                    id="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Lokalita" htmlFor="location" hint='např. "Beskydy"'>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </Field>
                <Field label="O nás" htmlFor="bio" hint="1–3 odstavce. Uvidí na veřejné stránce.">
                  <textarea
                    id="bio"
                    rows={5}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                  />
                </Field>
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">Vizuální</h2>
              <p className="mt-1 text-sm text-ink-500">
                Logo se objeví na hlavičce profilu a karet akcí. Úvodní fotka
                je celostránkový hero veřejné stránky.
              </p>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">Logo</p>
                  <div className="mt-2 flex items-start gap-3">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetUrl(logoUrl)}
                        alt="Logo"
                        className="h-20 w-20 shrink-0 rounded-md border border-border object-contain bg-surface"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-muted/40 text-xs text-ink-500">
                        bez loga
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <input
                        ref={logoInputRef}
                        id="logo-input"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoPick(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                      <label
                        htmlFor="logo-input"
                        className={[
                          "inline-flex w-fit cursor-pointer items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted focus-ring",
                          logoBusy ? "pointer-events-none opacity-60" : "",
                        ].join(" ")}
                      >
                        {logoBusy ? "Nahrávám…" : logoUrl ? "Vybrat jiné" : "Nahrát logo"}
                      </label>
                      {logoUrl && !logoBusy && (
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          className="w-fit text-xs text-ink-500 hover:text-danger"
                        >
                          Smazat
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-ink-900">Úvodní fotka</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetUrl(coverUrl)}
                        alt="Cover"
                        className="aspect-[16/9] w-full rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-muted/40 text-xs text-ink-500">
                        bez úvodní fotky
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        ref={coverInputRef}
                        id="cover-input"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleCoverPick(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                      <label
                        htmlFor="cover-input"
                        className={[
                          "inline-flex cursor-pointer items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted focus-ring",
                          coverBusy ? "pointer-events-none opacity-60" : "",
                        ].join(" ")}
                      >
                        {coverBusy ? "Nahrávám…" : coverUrl ? "Vybrat jiný" : "Nahrát fotku"}
                      </label>
                      {coverUrl && !coverBusy && (
                        <button
                          type="button"
                          onClick={handleCoverRemove}
                          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-500 hover:text-danger focus-ring"
                        >
                          Smazat
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Akcent (hex barva)"
                  htmlFor="accent"
                  hint="Volitelné. Použije se jako pozadí, když nemáš logo."
                >
                  <Input
                    id="accent"
                    placeholder="#ffc719"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </Field>
                <Field
                  label="Výchozí časové pásmo"
                  htmlFor="tz"
                  hint="IANA timezone (Europe/Prague)."
                >
                  <Input
                    id="tz"
                    value={defaultTz}
                    onChange={(e) => setDefaultTz(e.target.value)}
                  />
                </Field>
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">Sociální sítě a kontakt</h2>
              <p className="mt-1 text-sm text-ink-500">
                Co vyplníš, ukáže se na veřejné stránce jako odkaz. Prázdná pole se nezobrazí.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {SOCIAL_KEYS.map((s) => (
                  <Field key={s.key} label={s.label} htmlFor={`social-${s.key}`}>
                    <Input
                      id={`social-${s.key}`}
                      value={socials[s.key] ?? ""}
                      onChange={(e) => updateSocial(s.key, e.target.value)}
                      placeholder={s.placeholder}
                    />
                  </Field>
                ))}
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">Viditelnost</h2>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                {VISIBILITY_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-surface-muted has-[input:checked]:border-brand"
                  >
                    <input
                      type="radio"
                      name="vis"
                      checked={visibility === o.value}
                      onChange={() => setVisibility(o.value)}
                      className="mt-1 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink-900">{o.label}</span>
                      <span className="text-xs text-ink-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </CardSection>
          </Card>

          {error && <Alert variant="danger">{error}</Alert>}
          {saved && !error && (
            <Alert variant="success">Profil komunity uložen.</Alert>
          )}

          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
            >
              {submitting ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
