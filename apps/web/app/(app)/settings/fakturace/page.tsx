"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CountryPicker } from "@/components/ui/country-picker";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type BillingProfile,
  type BillingProfileWritePayload,
  auth,
} from "@/lib/api";

type Draft = BillingProfileWritePayload & { id?: number };

const EMPTY_DRAFT: Draft = {
  label: "",
  legal_name: "",
  ico: "",
  dic: "",
  address_street: "",
  address_city: "",
  address_zip: "",
  address_country: "CZ",
  iban: "",
  bank_name: "",
  is_default: false,
};

/**
 * Creator-side billing profiles — the "Dodavatel" snapshot on every
 * invoice the user issues. Multiple profiles allowed (osobně / s.r.o.).
 * Per-event picker selects which one to bill from.
 */
export default function BillingProfilesPage() {
  const [profiles, setProfiles] = useState<BillingProfile[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  async function reload() {
    try {
      const list = await auth.billingProfiles();
      setProfiles(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const { id, ...payload } = draft;
      if (id) {
        await auth.updateBillingProfile(id, payload);
      } else {
        await auth.createBillingProfile(payload);
      }
      setDraft(null);
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení selhalo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    const ok = await confirmDialog({
      title: "Smazat tento fakturační profil?",
      description:
        "Profil zmizí z přepínače u nových akcí. Už vystavené faktury zůstanou — držíme si jejich vlastní snapshot.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await auth.deleteBillingProfile(id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">
          Fakturační profily
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Co se objeví jako <strong>Dodavatel</strong> na fakturách, které
          vystavuješ k zaplaceným akcím. Můžeš mít víc profilů (osobně,
          firma) a u každé akce vybrat, kterým fakturovat.
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      {profiles === null ? (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      ) : profiles.length === 0 && !draft ? (
        <Card>
          <CardSection>
            <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
              <h3 className="text-base font-semibold text-ink-900">
                Zatím žádný profil
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                Bez profilu nemůžeme vygenerovat fakturu po označení
                platby. Pojď první přidat.
              </p>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="mt-5"
                onClick={() => setDraft({ ...EMPTY_DRAFT, is_default: true })}
              >
                + Přidat profil
              </Button>
            </div>
          </CardSection>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((p) => (
            <Card key={p.id}>
              <CardSection>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink-900">
                      {p.label}{" "}
                      {p.is_default && (
                        <span className="ml-2 rounded bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
                          Výchozí
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-ink-700">{p.legal_name}</p>
                    {p.ico && (
                      <p className="text-xs text-ink-500">
                        IČO: {p.ico}
                        {p.dic && ` · DIČ: ${p.dic}`}
                      </p>
                    )}
                    {(p.address_street || p.address_city) && (
                      <p className="text-xs text-ink-500">
                        {p.address_street}, {p.address_zip} {p.address_city}
                      </p>
                    )}
                    {p.iban && (
                      <p className="font-mono text-xs text-ink-500">
                        {p.iban}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => setDraft({ ...p })}
                    >
                      Upravit
                    </Button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-500 hover:text-danger"
                    >
                      Smazat
                    </button>
                  </div>
                </div>
              </CardSection>
            </Card>
          ))}
          {!draft && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="self-start"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
            >
              + Přidat další profil
            </Button>
          )}
        </div>
      )}

      {draft && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold text-ink-900">
              {draft.id ? "Upravit profil" : "Nový profil"}
            </h2>
            <form onSubmit={save} className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Popisek *"
                  htmlFor="bp-label"
                  hint='Krátká vlastní zkratka (např. "Osobně" / "Firma").'
                >
                  <Input
                    id="bp-label"
                    required
                    value={draft.label}
                    onChange={(e) => update("label", e.target.value)}
                  />
                </Field>
                <Field label="Název na faktuře *" htmlFor="bp-legal">
                  <Input
                    id="bp-legal"
                    required
                    value={draft.legal_name}
                    onChange={(e) => update("legal_name", e.target.value)}
                  />
                </Field>
                <Field label="IČO" htmlFor="bp-ico">
                  <Input
                    id="bp-ico"
                    value={draft.ico ?? ""}
                    onChange={(e) => update("ico", e.target.value)}
                  />
                </Field>
                <Field label="DIČ" htmlFor="bp-dic">
                  <Input
                    id="bp-dic"
                    value={draft.dic ?? ""}
                    onChange={(e) => update("dic", e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Ulice a č.p." htmlFor="bp-street">
                    <Input
                      id="bp-street"
                      value={draft.address_street ?? ""}
                      onChange={(e) =>
                        update("address_street", e.target.value)
                      }
                    />
                  </Field>
                </div>
                <Field label="Město" htmlFor="bp-city">
                  <Input
                    id="bp-city"
                    value={draft.address_city ?? ""}
                    onChange={(e) => update("address_city", e.target.value)}
                  />
                </Field>
                <Field label="PSČ" htmlFor="bp-zip">
                  <Input
                    id="bp-zip"
                    value={draft.address_zip ?? ""}
                    onChange={(e) => update("address_zip", e.target.value)}
                  />
                </Field>
                <Field label="Země" htmlFor="bp-country">
                  <CountryPicker
                    id="bp-country"
                    value={draft.address_country ?? "CZ"}
                    onChange={(code) => update("address_country", code)}
                  />
                </Field>
                <Field
                  label="IBAN"
                  htmlFor="bp-iban"
                  hint="Účet, na který chceš platby. Použije se i pro QR Platbu."
                >
                  <Input
                    id="bp-iban"
                    value={draft.iban ?? ""}
                    onChange={(e) =>
                      update("iban", e.target.value.toUpperCase())
                    }
                  />
                </Field>
                <Field label="Název banky" htmlFor="bp-bank">
                  <Input
                    id="bp-bank"
                    value={draft.bank_name ?? ""}
                    onChange={(e) => update("bank_name", e.target.value)}
                  />
                </Field>
              </div>

              <label className="flex items-start gap-2 text-sm text-ink-900">
                <input
                  type="checkbox"
                  checked={draft.is_default ?? false}
                  onChange={(e) => update("is_default", e.target.checked)}
                  className="mt-0.5 size-4 accent-brand"
                />
                Použít jako výchozí profil pro nové akce
              </label>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={saving}
                >
                  {saving ? "Ukládám…" : "Uložit"}
                </Button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
                >
                  Zrušit
                </button>
              </div>
            </form>
          </CardSection>
        </Card>
      )}
    </div>
  );
}
