"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { races, type RaceSubmission } from "@/lib/races";

/**
 * „Chybí tu závod?" modal — 3-step flow:
 *
 * 1. URL input — user vloží odkaz na race webpage
 * 2. AI extract loading — backend fetche URL, Claude vytáhne fields
 * 3. Preview form — user zkontroluje/upraví extract, submit ke schválení
 *
 * Modal se otevírá přes globální `document` event `olaf:open-race-submit`
 * (odesílá button na `/kalendar` page). Zavírá klikem na overlay nebo ✕.
 */
export function RaceSubmissionModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "loading" | "preview" | "done">(
    "input",
  );
  const [url, setUrl] = useState("");
  const [submission, setSubmission] = useState<RaceSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setStep("input");
      setUrl("");
      setSubmission(null);
      setError(null);
    };
    document.addEventListener("olaf:open-race-submit", handler);
    return () => {
      document.removeEventListener("olaf:open-race-submit", handler);
    };
  }, []);

  const handleClose = () => {
    setOpen(false);
  };

  const handleFetch = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setStep("loading");
    try {
      const result = await races.submitRace(url.trim());
      setSubmission(result);
      if (result.warning) {
        setError(`AI extract selhal: ${result.warning}. Můžeš doplnit ručně.`);
      }
      setStep("preview");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/login?next=/kalendar";
        return;
      }
      setError(
        e instanceof ApiError ? e.message : "Extrakce selhala.",
      );
      setStep("input");
    } finally {
      setBusy(false);
    }
  };

  const updateExtracted = (field: string, value: unknown) => {
    if (!submission) return;
    setSubmission({
      ...submission,
      extracted_data: { ...submission.extracted_data, [field]: value },
    });
  };

  const handleSaveEdits = async () => {
    if (!submission) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await races.updateSubmission(
        submission.id,
        submission.extracted_data,
      );
      setSubmission(updated);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const data = (submission?.extracted_data ?? {}) as Record<
    string,
    string | number | null | undefined
  >;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-md border-t border-border bg-canvas p-5 shadow-2xl sm:rounded-md sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink-900">
            {step === "done" ? "Návrh odeslán 🎉" : "Chybí tu závod?"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Zavřít"
            className="rounded-md p-1 text-ink-500 hover:bg-surface-muted focus-ring"
          >
            ✕
          </button>
        </div>

        {step === "input" && (
          <div>
            <p className="mb-4 text-sm leading-relaxed text-ink-500">
              Vlož URL stránky závodu a AI ji rozparsuje — jméno, distance,
              D+, termín, lokalita. Pak zkontroluješ a pošleš ke schválení.
            </p>
            <label className="grid gap-1 text-sm text-ink-700">
              URL závodu
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.marathonmontblanc.fr/en/races/42km-du-mont-blanc"
                className="rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
                autoFocus
                disabled={busy}
              />
            </label>
            {error && (
              <div className="mt-3 rounded-sm border border-danger/40 bg-danger-soft p-2 text-sm text-danger">
                {error}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-border-strong bg-canvas px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-muted focus-ring"
                disabled={busy}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleFetch}
                disabled={!url.trim() || busy}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-hover focus-ring disabled:opacity-50"
              >
                🤖 Vyčíst závod
              </button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              Limit 5 návrhů denně. Návrh dostane admin ke schválení.
            </p>
          </div>
        )}

        {step === "loading" && (
          <div className="py-8 text-center">
            <p className="text-sm text-ink-700">
              🤖 AI čte stránku a extrahuje fields…
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Trvá to 5-15 sekund. Vydrž.
            </p>
          </div>
        )}

        {step === "preview" && submission && (
          <div>
            <p className="mb-3 text-sm text-ink-500">
              Zkontroluj a případně uprav. Prázdné pole = AI to nenašla.
            </p>
            {error && (
              <div className="mb-3 rounded-sm border border-warning/40 bg-warning/10 p-2 text-sm text-warning">
                {error}
              </div>
            )}
            <div className="grid gap-3">
              <TextField
                label="Název závodu"
                value={(data.name as string) || ""}
                onChange={(v) => updateExtracted("name", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Distance (km)"
                  type="number"
                  value={(data.distance_km as number) ?? ""}
                  onChange={(v) =>
                    updateExtracted(
                      "distance_km",
                      v === "" ? null : Number(v),
                    )
                  }
                />
                <TextField
                  label="D+ (m)"
                  type="number"
                  value={(data.elevation_m as number) ?? ""}
                  onChange={(v) =>
                    updateExtracted(
                      "elevation_m",
                      v === "" ? null : Number(v),
                    )
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Sport"
                  value={(data.sport as string) || "trail"}
                  onChange={(v) => updateExtracted("sport", v)}
                  options={[
                    { value: "trail", label: "Trail / běh" },
                    { value: "skialp", label: "Skialp" },
                  ]}
                />
                <SelectField
                  label="Oblast"
                  value={(data.region as string) || ""}
                  onChange={(v) => updateExtracted("region", v)}
                  options={[
                    { value: "", label: "—" },
                    { value: "CZ", label: "🇨🇿 Česko" },
                    { value: "SK", label: "🇸🇰 Slovensko" },
                    { value: "PL", label: "🇵🇱 Polsko" },
                    { value: "ALP", label: "🏔️ Alpy" },
                    { value: "SEV", label: "❄️ Skandinávie" },
                    { value: "IBE", label: "🇪🇸 Ibérie" },
                    { value: "BAL", label: "🇬🇷 Balkán" },
                    { value: "OST", label: "🏝️ Ostrovy" },
                    { value: "SVET", label: "🌍 Svět" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Země"
                  value={(data.country as string) || ""}
                  onChange={(v) => updateExtracted("country", v)}
                />
                <TextField
                  label="Místo"
                  value={(data.place as string) || ""}
                  onChange={(v) => updateExtracted("place", v)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  label="Rok"
                  type="number"
                  value={(data.year as number) ?? ""}
                  onChange={(v) =>
                    updateExtracted("year", v === "" ? null : Number(v))
                  }
                />
                <TextField
                  label="Měsíc"
                  type="number"
                  value={(data.month as number) ?? ""}
                  onChange={(v) =>
                    updateExtracted("month", v === "" ? null : Number(v))
                  }
                />
                <TextField
                  label="Den"
                  type="number"
                  value={(data.day as number) ?? ""}
                  onChange={(v) =>
                    updateExtracted("day", v === "" ? null : Number(v))
                  }
                />
              </div>
              <SelectField
                label="Série"
                value={(data.series as string) || "indep"}
                onChange={(v) => updateExtracted("series", v)}
                options={[
                  { value: "indep", label: "Nezávislý" },
                  { value: "utmb", label: "UTMB World Series" },
                  { value: "wtm", label: "World Trail Majors" },
                  { value: "sky", label: "Skyrunner" },
                  { value: "major", label: "Major" },
                ]}
              />
              <TextField
                label="Charakteristika (1-2 věty)"
                value={(data.highlight as string) || ""}
                onChange={(v) => updateExtracted("highlight", v)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-border-strong bg-canvas px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-muted focus-ring"
                disabled={busy}
              >
                Zavřít
              </button>
              <button
                type="button"
                onClick={handleSaveEdits}
                disabled={busy}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-hover focus-ring disabled:opacity-50"
              >
                ✓ Odeslat ke schválení
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-4 text-center">
            <p className="text-sm leading-relaxed text-ink-700">
              Návrh byl uložen jako <strong>pending</strong>. Admin ho
              projde a schválí — pak se závod objeví v kalendáři.
            </p>
            <p className="mt-3 text-xs text-ink-500">
              Kdykoliv můžeš zkontrolovat v Django adminu.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover focus-ring"
            >
              Zavřít
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-ink-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1 text-xs text-ink-700">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
