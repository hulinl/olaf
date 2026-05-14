"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, type User, auth } from "@/lib/api";
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

  function update<K extends keyof User>(key: K, value: User[K]) {
    setUser((u) => ({ ...u, [key]: value }));
    setSaved(false);
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
