"use client";

import { FormEvent, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CountryPicker } from "@/components/ui/country-picker";
import { Field, Input } from "@/components/ui/field";
import { ApiError, type User, auth } from "@/lib/api";
import { applyDialPrefix } from "@/lib/countries";
import { useUser } from "@/lib/user-context";

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const DIET_OPTIONS: { value: User["diet"]; label: string }[] = [
  { value: "", label: "Nevyplněno" },
  { value: "omnivore", label: "Vše (omnivore)" },
  { value: "vegetarian", label: "Vegetarián" },
  { value: "vegan", label: "Vegan" },
  { value: "other", label: "Jiné" },
];

const FITNESS_OPTIONS: { value: User["fitness_level"]; label: string }[] = [
  { value: "", label: "Nevyplněno" },
  { value: "beginner", label: "Začátečník" },
  { value: "intermediate", label: "Středně pokročilý" },
  { value: "advanced", label: "Pokročilý" },
];

export default function ProfileSettingsPage() {
  const initial = useUser();
  const [user, setUser] = useState<User>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmDialog = useConfirm();

  function update<K extends keyof User>(key: K, value: User[K]) {
    setUser((u) => ({ ...u, [key]: value }));
    setSaved(false);
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      const updated = await auth.uploadAvatar(file);
      setUser(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Nahrání fotky se nepodařilo.",
      );
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAvatarDelete() {
    const ok = await confirmDialog({
      title: "Smazat profilovou fotku?",
      description:
        "Po smazání zase uvidíš jen iniciály. Můžeš kdykoli nahrát novou.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
    setAvatarBusy(true);
    try {
      const updated = await auth.deleteAvatar();
      setUser(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Smazání fotky se nepodařilo.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Partial<User> = {
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name,
        phone: user.phone,
        // Bio se zobrazuje na public landing eventu (Organizers blok),
        // takže ho ukládáme jako součást běžného profile save — same
        // multi-line text, same flow.
        bio: user.bio,
        // Address fields used to be missing here — typing them in
        // and hitting Save looked like it worked because the local
        // state updated, but a refresh re-fetched the empty server
        // value. Send all four.
        address_street: user.address_street,
        address_city: user.address_city,
        address_zip: user.address_zip,
        address_country: user.address_country,
        // Billing fields too — gated by has_billing_address but
        // always sent so the toggle round-trips correctly.
        has_billing_address: user.has_billing_address,
        billing_name: user.billing_name,
        billing_ico: user.billing_ico,
        billing_dic: user.billing_dic,
        billing_street: user.billing_street,
        billing_city: user.billing_city,
        billing_zip: user.billing_zip,
        billing_country: user.billing_country,
        fitness_level: user.fitness_level,
        fitness_note: user.fitness_note,
        pace_10k: user.pace_10k,
        weekly_km: user.weekly_km,
        longest_run: user.longest_run,
        diet: user.diet,
        diet_note: user.diet_note,
        tshirt_size: user.tshirt_size,
        emergency_contact_name: user.emergency_contact_name,
        emergency_contact_phone: user.emergency_contact_phone,
        emergency_contact_relationship: user.emergency_contact_relationship,
      };
      const updated = await auth.updateMe(patch);
      setUser(updated);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení se nepodařilo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Profil</h2>
          <p className="mt-1 text-sm text-ink-500">
            Tyto údaje se používají k předvyplnění přihlašovacího formuláře u
            akcí. Vyplň je jednou a máš pokoj.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Jméno" htmlFor="first_name">
              <Input
                id="first_name"
                value={user.first_name}
                onChange={(e) => update("first_name", e.target.value)}
              />
            </Field>
            <Field label="Příjmení" htmlFor="last_name">
              <Input
                id="last_name"
                value={user.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            </Field>
            <Field label="Display name" htmlFor="display_name">
              <Input
                id="display_name"
                value={user.display_name}
                onChange={(e) => update("display_name", e.target.value)}
              />
            </Field>
            <Field label="Telefon" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                value={user.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </Field>
            <Field label="E-mail (neměnitelné)" htmlFor="email">
              <Input
                id="email"
                value={user.email}
                disabled
                className="opacity-60"
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            O mně (veřejné)
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Profilová fotka a krátké bio. Tvůrce eventu si tě může vybrat
            do sekce „Organizátoři” na public landing — pak se tu vyplněné
            údaje objeví na kartě. Pokud tě nikdo nevybere, údaje zůstávají
            soukromé.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="flex flex-col items-center gap-3">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <Avatar
                  firstName={user.first_name}
                  lastName={user.last_name}
                  size={96}
                />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {user.avatar_url ? "Vyměnit" : "Nahrát fotku"}
                </Button>
                {user.avatar_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleAvatarDelete}
                    disabled={avatarBusy}
                  >
                    Smazat
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarPick}
              />
            </div>
            <Field
              label="Bio"
              htmlFor="bio"
              hint="Krátký popis o tobě — max. 2–3 věty. Co umíš, čím se zabýváš, co tě baví."
            >
              <textarea
                id="bio"
                value={user.bio}
                onChange={(e) => update("bio", e.target.value)}
                rows={4}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
                placeholder="Olaf — průvodce, instruktor, jezdím od mladí po horách. Vedu kempy a víkendovky pro nepříliš zkušený lidi co chtějí poznat hory bez tlaku."
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Adresa</h2>
          <p className="mt-1 text-sm text-ink-500">
            Použijeme ji pro generování faktur a smluvních dokumentů u akcí,
            kde je to potřeba.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Ulice a č.p." htmlFor="address_street">
                <Input
                  id="address_street"
                  value={user.address_street}
                  onChange={(e) => update("address_street", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Město" htmlFor="address_city">
              <Input
                id="address_city"
                value={user.address_city}
                onChange={(e) => update("address_city", e.target.value)}
              />
            </Field>
            <Field label="PSČ" htmlFor="address_zip">
              <Input
                id="address_zip"
                value={user.address_zip}
                onChange={(e) => update("address_zip", e.target.value)}
              />
            </Field>
            <Field
              label="Země"
              htmlFor="address_country"
              hint="Mění předvolbu telefonu, pokud telefon ještě nemá svojí."
            >
              <CountryPicker
                id="address_country"
                value={user.address_country}
                onChange={(code) => {
                  setUser((u) => ({
                    ...u,
                    address_country: code,
                    // Auto-prefix the phone unless the user already
                    // entered a "+…" prefix themselves.
                    phone: applyDialPrefix(u.phone, code),
                  }));
                  setSaved(false);
                }}
              />
            </Field>
          </div>

          <label className="mt-6 flex items-start gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={user.has_billing_address}
              onChange={(e) => update("has_billing_address", e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            Mám jinou fakturační adresu
          </label>

          {user.has_billing_address && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Jméno / název firmy"
                  htmlFor="billing_name"
                  hint="Komu fakturujeme. Může být firma (B2B) i jiná osoba."
                >
                  <Input
                    id="billing_name"
                    value={user.billing_name}
                    onChange={(e) => update("billing_name", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="IČO" htmlFor="billing_ico">
                <Input
                  id="billing_ico"
                  value={user.billing_ico}
                  onChange={(e) => update("billing_ico", e.target.value)}
                />
              </Field>
              <Field label="DIČ" htmlFor="billing_dic">
                <Input
                  id="billing_dic"
                  value={user.billing_dic}
                  onChange={(e) => update("billing_dic", e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Ulice a č.p." htmlFor="billing_street">
                  <Input
                    id="billing_street"
                    value={user.billing_street}
                    onChange={(e) => update("billing_street", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Město" htmlFor="billing_city">
                <Input
                  id="billing_city"
                  value={user.billing_city}
                  onChange={(e) => update("billing_city", e.target.value)}
                />
              </Field>
              <Field label="PSČ" htmlFor="billing_zip">
                <Input
                  id="billing_zip"
                  value={user.billing_zip}
                  onChange={(e) => update("billing_zip", e.target.value)}
                />
              </Field>
              <Field label="Země" htmlFor="billing_country">
                <CountryPicker
                  id="billing_country"
                  value={user.billing_country}
                  onChange={(code) => update("billing_country", code)}
                />
              </Field>
            </div>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Kondice a výkonnost
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Při přihlášce na akci se předvyplní automaticky. Vyplň co znáš —
            zbytek volitelné.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Fitness level" htmlFor="fitness_level">
              <select
                id="fitness_level"
                value={user.fitness_level}
                onChange={(e) =>
                  update("fitness_level", e.target.value as User["fitness_level"])
                }
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm focus-ring"
              >
                {FITNESS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Čas na 10 km na rovince"
              htmlFor="pace_10k"
              hint='např. "55:00"'
            >
              <Input
                id="pace_10k"
                value={user.pace_10k}
                onChange={(e) => update("pace_10k", e.target.value)}
              />
            </Field>
            <Field label="Týdenní km (průměr)" htmlFor="weekly_km">
              <Input
                id="weekly_km"
                type="number"
                min={0}
                value={user.weekly_km ?? ""}
                onChange={(e) =>
                  update(
                    "weekly_km",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </Field>
            <div className="sm:col-span-3">
              <Field
                label="Nejdelší souvislý běh"
                htmlFor="longest_run"
                hint='např. "21 km (půlmaraton)"'
              >
                <Input
                  id="longest_run"
                  value={user.longest_run}
                  onChange={(e) => update("longest_run", e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field
                label="Krátká poznámka"
                htmlFor="fitness_note"
                hint="Cíl na sezónu, oblíbený typ tréninku, …"
              >
                <Input
                  id="fitness_note"
                  value={user.fitness_note}
                  onChange={(e) => update("fitness_note", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Strava a alergie
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Strava" htmlFor="diet">
              <select
                id="diet"
                value={user.diet}
                onChange={(e) => update("diet", e.target.value as User["diet"])}
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm focus-ring"
              >
                {DIET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Alergie / poznámka"
              htmlFor="diet_note"
              hint="Alergie, intolerance, preference"
            >
              <Input
                id="diet_note"
                value={user.diet_note}
                onChange={(e) => update("diet_note", e.target.value)}
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Velikost trika
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {TSHIRT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => update("tshirt_size", size)}
                className={[
                  "h-10 w-12 rounded-md border text-sm font-medium transition-colors focus-ring",
                  user.tshirt_size === size
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                ].join(" ")}
              >
                {size}
              </button>
            ))}
            <button
              type="button"
              onClick={() => update("tshirt_size", "")}
              className={[
                "h-10 rounded-md border px-3 text-sm font-medium transition-colors focus-ring",
                user.tshirt_size === ""
                  ? "border-brand bg-surface-muted text-ink-900"
                  : "border-border bg-surface text-ink-500 hover:bg-surface-muted",
              ].join(" ")}
            >
              Vyčistit
            </button>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Emergency kontakt
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Komu zavolat, kdyby se na akci něco stalo.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Jméno" htmlFor="em_name">
              <Input
                id="em_name"
                value={user.emergency_contact_name}
                onChange={(e) =>
                  update("emergency_contact_name", e.target.value)
                }
              />
            </Field>
            <Field label="Telefon" htmlFor="em_phone">
              <Input
                id="em_phone"
                type="tel"
                value={user.emergency_contact_phone}
                onChange={(e) =>
                  update("emergency_contact_phone", e.target.value)
                }
              />
            </Field>
            <Field
              label="Vztah"
              htmlFor="em_rel"
              hint='např. "partner", "máma"'
            >
              <Input
                id="em_rel"
                value={user.emergency_contact_relationship}
                onChange={(e) =>
                  update("emergency_contact_relationship", e.target.value)
                }
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}
      {saved && !error && (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-ink-900">
          Profil uložen.
        </p>
      )}

      <div>
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          {submitting ? "Ukládám…" : "Uložit profil"}
        </Button>
      </div>
    </form>
  );
}
