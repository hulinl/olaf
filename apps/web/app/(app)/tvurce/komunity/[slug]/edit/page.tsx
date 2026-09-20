"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useRef, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { PhotoEditor } from "@/components/ui/photo-editor";
import {
  ApiError,
  type Workspace,
  type WorkspaceMemberSummary,
  type WorkspaceWritePayload,
  assetUrl,
  auth,
  workspaces,
} from "@/lib/api";
import { lookupCzBankName } from "@/lib/cz-banks";
import { SOCIAL_SERVICES } from "@/lib/social-services";
import { timezoneGroups } from "@/lib/timezones";

interface Props {
  params: Promise<{ slug: string }>;
}

// SOCIAL_KEYS odvozeny z whitelistu v `lib/social-services.tsx` —
// jeden zdroj pravdy pro editor + renderer. Facebook je z whitelistu
// pryč (user request 2026-06-25); legacy hodnoty v DB zůstávají, ale
// už se v editoru ani na public stránce nezobrazí.
const SOCIAL_KEYS = SOCIAL_SERVICES.map((s) => ({
  key: s.key,
  label: s.label,
  placeholder: s.placeholder,
}));

// Doporučené brand barvy. User si stejně může vybrat cokoli přes hex
// input nebo native color picker, ale palette umožní kliknout „jednu
// z olaf-friendly" bez piplání s hex kódem.
const ACCENT_PALETTE = [
  "#ffc719",
  "#f97316",
  "#dc2626",
  "#16a34a",
  "#0284c7",
  "#7c3aed",
  "#0f172a",
  "#64748b",
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
  const confirmDialog = useConfirm();
  // Cover editor modal — otevře se po uploadu (fresh crop) nebo přes
  // „Upravit rámování". Lokální state drží focal+zoom aby drag/zoom
  // byl responzivní bez roundtripu; save flushne PATCH na workspace.
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverEditorFocal, setCoverEditorFocal] = useState({
    x: 50,
    y: 50,
    zoom: 100,
  });
  const [coverEditorBusy, setCoverEditorBusy] = useState(false);

  const [paymentIban, setPaymentIban] = useState("");
  const [paymentBankName, setPaymentBankName] = useState("");
  const [paymentDueDays, setPaymentDueDays] = useState("14");
  // Read-only seznam owner + spolutvůrců pro zobrazení v „Spolutvůrci"
  // kartě. Přidávání / promote jde přes stránku Členové — tady jen
  // shortcut a přehled, ať owner nemusí přeskakovat mezi taby.
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberSummary[] | null>(null);
  // Poslední auto-vyplněný název banky drží, jestli si user pole
  // přepsal ručně. Když ano, další změna IBAN už mu do toho nesahá;
  // když ne (pole prázdné nebo drží náš minulý návrh), replace-neme.
  const lastAutoBankNameRef = useRef<string>("");
  const tzGroups = timezoneGroups();
  const [eventSharingPolicy, setEventSharingPolicy] = useState<
    "admin_only" | "members"
  >("admin_only");

  useEffect(() => {
    let cancelled = false;
    workspaces
      .detail(slug)
      .then(async (ws) => {
        if (cancelled) return;
        if (ws.my_role !== "owner" && ws.my_role !== "admin") {
          try {
            await auth.me();
            router.replace(`/${slug}`);
          } catch {
            router.replace(`/login?next=/tvurce/komunity/${slug}/edit`);
          }
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
        setCoverEditorFocal({
          x: ws.cover_focal_x ?? 50,
          y: ws.cover_focal_y ?? 50,
          zoom: ws.cover_zoom ?? 100,
        });
        setPaymentIban(ws.payment_iban ?? "");
        setPaymentBankName(ws.payment_bank_name ?? "");
        setPaymentDueDays(String(ws.payment_due_days ?? 14));
        // Když saved IBAN odpovídá známé bance, ulož si to jako
        // baseline pro budoucí auto-doplňování — pokud user pole
        // později přepíše ručně, poznáme to.
        lastAutoBankNameRef.current = lookupCzBankName(ws.payment_iban ?? "") ?? "";
        setEventSharingPolicy(
          (ws.event_sharing_policy as "admin_only" | "members") ?? "admin_only",
        );
        // Lazy-load týmu (owner + spolutvůrci) — 1 samostatný request,
        // ať edit page nečekala na členy před renderem formuláře.
        workspaces
          .members(slug)
          .then((all) => {
            if (cancelled) return;
            setTeamMembers(
              all.filter((m) => m.role === "owner" || m.role === "admin"),
            );
          })
          .catch(() => {
            if (!cancelled) setTeamMembers([]);
          });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/tvurce/komunity/${slug}/edit`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/tvurce/komunity");
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

  function handleIbanChange(raw: string) {
    const upper = raw.toUpperCase();
    setPaymentIban(upper);
    const auto = lookupCzBankName(upper) ?? "";
    // Auto-vyplnit název banky jen když si user ještě nic nenapsal,
    // nebo mu tam náš minulý návrh sedí. Ruční přepis respektujeme.
    if (
      auto &&
      (paymentBankName === "" || paymentBankName === lastAutoBankNameRef.current)
    ) {
      setPaymentBankName(auto);
    }
    lastAutoBankNameRef.current = auto;
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
    const ok = await confirmDialog({
      title: "Smazat logo komunity?",
      description: "Místo loga se zobrazí výchozí placeholder. Můžeš kdykoli nahrát nové.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
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
      // Backend resetnul focals na 50/50/100 — otevřeme editor hned,
      // ať user rámuje čerstvou fotku (jinak by mohla mít auto-crop
      // do středu, který se nevejde). Stejný flow jako avatar upload.
      setCoverEditorFocal({
        x: updated.cover_focal_x ?? 50,
        y: updated.cover_focal_y ?? 50,
        zoom: updated.cover_zoom ?? 100,
      });
      setCoverEditorOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.firstFieldError() ?? err.message : "Upload selhal.");
    } finally {
      setCoverBusy(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  function openCoverEditor() {
    if (!workspace) return;
    setCoverEditorFocal({
      x: workspace.cover_focal_x ?? 50,
      y: workspace.cover_focal_y ?? 50,
      zoom: workspace.cover_zoom ?? 100,
    });
    setCoverEditorOpen(true);
  }

  async function saveCoverEditor() {
    setCoverEditorBusy(true);
    setError(null);
    try {
      const updated = await workspaces.update(slug, {
        cover_focal_x: coverEditorFocal.x,
        cover_focal_y: coverEditorFocal.y,
        cover_zoom: coverEditorFocal.zoom,
      });
      setWorkspace(updated);
      setCoverEditorOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení rámování selhalo.",
      );
    } finally {
      setCoverEditorBusy(false);
    }
  }

  async function handleCoverRemove() {
    const ok = await confirmDialog({
      title: "Smazat úvodní fotku?",
      description: "Po smazání zůstane karta komunity bez velkého vizuálu, dokud nenahraješ novou.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
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
        payment_iban: paymentIban.replace(/\s+/g, ""),
        payment_bank_name: paymentBankName,
        payment_due_days: Number(paymentDueDays) || 14,
        event_sharing_policy: eventSharingPolicy,
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
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (!workspace) return null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Komunity", href: "/tvurce/komunity" },
          { label: workspace.name, href: `/tvurce/komunity/${slug}` },
          { label: "Upravit" },
        ]}
      />

      <header>
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
                Logo se objeví na hlavičce profilu a karet akcí. Úvodní
                fotka je FB-style banner nahoře veřejné stránky.
              </p>

              <div className="mt-5 flex flex-col gap-6">
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
                      <div className="relative aspect-[3/1] w-full overflow-hidden rounded-md border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={assetUrl(coverUrl) ?? ""}
                          alt="Cover"
                          className="h-full w-full object-cover"
                          style={{
                            objectPosition: `${coverEditorFocal.x}% ${coverEditorFocal.y}%`,
                            transform: `scale(${coverEditorFocal.zoom / 100})`,
                            transformOrigin: `${coverEditorFocal.x}% ${coverEditorFocal.y}%`,
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[3/1] w-full items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-muted/40 text-xs text-ink-500">
                        bez úvodní fotky
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
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
                        {coverBusy ? "Nahrávám…" : coverUrl ? "Vyměnit" : "Nahrát fotku"}
                      </label>
                      {coverUrl && !coverBusy && (
                        <button
                          type="button"
                          onClick={openCoverEditor}
                          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-muted focus-ring"
                        >
                          Upravit rámování
                        </button>
                      )}
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
                  label="Akcent"
                  htmlFor="accent"
                  hint="Volitelné. Použije se jako pozadí, když nemáš logo. Vyber ze palety nebo napiš vlastní hex."
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Vybrat barvu"
                        value={accentColor || "#ffc719"}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-11 w-14 cursor-pointer rounded-md border border-border bg-surface p-1 focus-ring"
                      />
                      <Input
                        id="accent"
                        placeholder="#ffc719"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div
                      role="listbox"
                      aria-label="Nabídka barev"
                      className="flex flex-wrap gap-1.5"
                    >
                      {ACCENT_PALETTE.map((color) => {
                        const active =
                          accentColor.toLowerCase() === color.toLowerCase();
                        return (
                          <button
                            key={color}
                            type="button"
                            role="option"
                            aria-selected={active}
                            title={color}
                            onClick={() => setAccentColor(color)}
                            className={[
                              "h-7 w-7 rounded-md border transition-transform focus-ring hover:scale-110",
                              active
                                ? "border-ink-900 ring-2 ring-offset-1 ring-ink-900"
                                : "border-border",
                            ].join(" ")}
                            style={{ backgroundColor: color }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </Field>
                <Field
                  label="Výchozí časové pásmo"
                  htmlFor="tz"
                  hint="Používá se pro časy akcí. Default Europe/Prague."
                >
                  <select
                    id="tz"
                    value={defaultTz}
                    onChange={(e) => setDefaultTz(e.target.value)}
                    className="h-11 rounded-md border border-border bg-surface px-3 text-sm focus-ring"
                  >
                    {tzGroups.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.values.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-ink-900">
                  Spolutvůrci
                </h2>
                <Link
                  href={`/tvurce/komunity/${slug}/clenove`}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  Spravovat v Členové →
                </Link>
              </div>
              <p className="mt-1 text-sm text-ink-500">
                Kdo tuhle komunitu spravuje s tebou — mají skoro stejná
                práva jako ty (nemůžou smazat komunitu, měnit role ostatních,
                předávat vlastnictví). Přidávání a odebírání jde na stránce
                Členové.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {teamMembers === null ? (
                  <p className="text-sm text-ink-500">Načítám…</p>
                ) : teamMembers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
                    Zatím jen ty. Přidej dalšího spolutvůrce v sekci
                    Členové.
                  </p>
                ) : (
                  teamMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
                    >
                      <TeamMemberAvatar member={m} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-ink-900">
                          {m.full_name || m.email}
                        </span>
                        {m.full_name && (
                          <span className="truncate text-xs text-ink-500">
                            {m.email}
                          </span>
                        )}
                      </div>
                      <span
                        className={[
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          m.role === "owner"
                            ? "bg-brand/15 text-brand"
                            : "bg-warning/15 text-warning",
                        ].join(" ")}
                      >
                        {m.role === "owner" ? "Owner" : "Spolutvůrce"}
                      </span>
                    </div>
                  ))
                )}
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
              <h2 className="text-base font-semibold text-ink-900">
                Platby
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Bankovní účet, na který přijdou platby za placené akce. Pro
                každou registraci se vygeneruje QR Platba s variabilním
                symbolem, který jasně identifikuje, kdo a za kterou akci
                platí.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    label="IBAN"
                    htmlFor="iban"
                    hint="Český formát: CZ65 0800 0000 1920 0014 5399 (mezery povoleny). Podle kódu banky ti níž doplníme název."
                  >
                    <Input
                      id="iban"
                      value={paymentIban}
                      onChange={(e) => handleIbanChange(e.target.value)}
                      placeholder="CZ65 0800 0000 1920 0014 5399"
                    />
                  </Field>
                </div>
                <Field
                  label="Název banky"
                  htmlFor="bank-name"
                  hint="Auto-doplní se z IBAN. Můžeš přepsat, pokud chceš vlastní tvar."
                >
                  <Input
                    id="bank-name"
                    value={paymentBankName}
                    onChange={(e) => setPaymentBankName(e.target.value)}
                    placeholder="Fio banka"
                  />
                </Field>
                <Field
                  label="Splatnost (dny)"
                  htmlFor="due-days"
                  hint="Kolik dní má účastník na zaplacení od registrace."
                >
                  <Input
                    id="due-days"
                    type="number"
                    min={1}
                    max={365}
                    value={paymentDueDays}
                    onChange={(e) => setPaymentDueDays(e.target.value)}
                  />
                </Field>
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

          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">
                Sdílení akcí do komunity
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Kdo z členů této komunity smí do ní sdílet vlastní akce
                (= akce se objeví v komunitním feedu).
              </p>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                {(
                  [
                    {
                      value: "admin_only" as const,
                      label: "Pouze admini komunity",
                      hint: "Owner a admini můžou sdílet vlastní akce do komunity. Běžní členové ne — komunitní feed zůstává pod tvou kontrolou.",
                    },
                    {
                      value: "members" as const,
                      label: "Všichni členové komunity",
                      hint: "Kdokoli ze členů může sdílet vlastní akce do komunity. Hodí se pro otevřenější skupiny, kde lidé pořádají vlastní setkání.",
                    },
                  ]
                ).map((o) => (
                  <label
                    key={o.value}
                    className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-surface-muted has-[input:checked]:border-brand"
                  >
                    <input
                      type="radio"
                      name="share"
                      checked={eventSharingPolicy === o.value}
                      onChange={() => setEventSharingPolicy(o.value)}
                      className="mt-1 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink-900">
                        {o.label}
                      </span>
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

      {coverEditorOpen && coverUrl && (
        <CoverEditorModal
          imageUrl={coverUrl}
          focalX={coverEditorFocal.x}
          focalY={coverEditorFocal.y}
          zoom={coverEditorFocal.zoom}
          onChange={(next) =>
            setCoverEditorFocal({
              x: next.focal_x,
              y: next.focal_y,
              zoom: next.zoom,
            })
          }
          onCancel={() => setCoverEditorOpen(false)}
          onSave={saveCoverEditor}
          busy={coverEditorBusy}
        />
      )}
    </div>
  );
}

/** Modal se sdíleným PhotoEditor v 16:9 aspektu — matchuje public
 *  hero cover na /<slug>. Backdrop click / Esc zavírají; save flushne
 *  focal+zoom přes WorkspaceWriteSerializer PATCH. Stejný pattern jako
 *  AvatarEditorModal v settings/profile — jen jiný aspect ratio. */
function CoverEditorModal({
  imageUrl,
  focalX,
  focalY,
  zoom,
  onChange,
  onCancel,
  onSave,
  busy,
}: {
  imageUrl: string;
  focalX: number;
  focalY: number;
  zoom: number;
  onChange: (next: {
    focal_x: number;
    focal_y: number;
    zoom: number;
  }) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upravit rámování úvodní fotky"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 px-4 py-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h3 className="text-lg font-semibold text-ink-900">
          Upravit rámování
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Přetáhni fotku a přiblíž, jak má být vidět na veřejné stránce
          komunity. FB-style banner — 3:1 aspect. Rámečky uvnitř ukazují,
          co bude vidět na desktopu vs. mobilu.
        </p>
        <div className="mt-4">
          <PhotoEditor
            imageUrl={imageUrl}
            focalX={focalX}
            focalY={focalY}
            zoom={zoom}
            aspectRatio="3/1"
            previewShape="rect"
            maxWidthClass="max-w-2xl"
            label=""
            hint="Přetáhni fotku a slider dole zoomni. Rámečky ukazují, co bude vidět na desktopu vs. mobilu — cover je na public stránce FB-style banner."
            viewportGuides={[
              // Desktop cover na public /<slug>: h-60 (240px) při
              // typické šířce 1024-1280px → aspect ~4-5:1.
              { label: "Desktop", aspectRatio: 4.5, colorClass: "border-brand" },
              // Mobile cover: h-32 (128px) při ~375-400px → aspect
              // ~2.9-3:1 (blíž ke stěně editor 3/1).
              {
                label: "Mobil",
                aspectRatio: 2.9,
                colorClass: "border-warning",
              },
            ]}
            onChange={onChange}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Zrušit
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void onSave()}
            loading={busy}
          >
            Uložit rámování
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Malý čtvercový avatar pro seznam spolutvůrců v Nastavení. Používá
 *  focal + zoom z members API, ať tvůrce vypadá stejně jako jinde
 *  v aplikaci. Když member nemá avatar, spadneme na iniciály. */
function TeamMemberAvatar({ member }: { member: WorkspaceMemberSummary }) {
  const url = assetUrl(member.avatar?.url ?? "");
  const initials =
    `${member.first_name.charAt(0) ?? ""}${member.last_name.charAt(0) ?? ""}`
      .toUpperCase() || (member.email.charAt(0) ?? "?").toUpperCase();
  if (!url) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink-700">
        {initials}
      </div>
    );
  }
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${member.avatar?.focal_x ?? 50}% ${member.avatar?.focal_y ?? 50}%`,
          transform: `scale(${(member.avatar?.zoom ?? 100) / 100})`,
          transformOrigin: `${member.avatar?.focal_x ?? 50}% ${member.avatar?.focal_y ?? 50}%`,
        }}
      />
    </div>
  );
}
