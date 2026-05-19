"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, workspaces } from "@/lib/api";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function NewWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const ws = await workspaces.create({ slug, name, location, bio });
      // Drop them straight into the owner cockpit for the new komunita —
      // the edit form moved under /admin/komunity/<slug>/edit when the
      // Tvůrce shell consolidated.
      router.push(`/admin/komunity/${ws.slug}/edit`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Vytvoření selhalo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Komunity", href: "/workspaces" },
            { label: "Nová komunita" },
          ]}
        />

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            Vytvoř komunitu
          </h1>
          <p className="mt-2 text-ink-500">
            Komunita je tvůj domov na olafu — profil, logo, kontakty a všechny
            akce na jednom místě. Po vytvoření tě pustíme rovnou do editoru
            profilu, abys mohl doplnit popisek, úvodní fotku a sociální sítě.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">
                Základní info
              </h2>
              <div className="mt-5 flex flex-col gap-4">
                <Field label="Název komunity *" htmlFor="name">
                  <Input
                    id="name"
                    required
                    value={name}
                    onChange={(e) => updateName(e.target.value)}
                    placeholder="Olaf Adventures"
                  />
                </Field>
                <Field
                  label="Slug *"
                  htmlFor="slug"
                  hint={`URL bude /${slug || "<slug>"}. Slug se generuje z názvu, ale můžeš ho přepsat.`}
                >
                  <Input
                    id="slug"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    placeholder="olafadventures"
                  />
                </Field>
                <Field
                  label="Lokalita"
                  htmlFor="location"
                  hint='např. "Beskydy" nebo "Praha"'
                >
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </Field>
                <Field
                  label="Krátký popis"
                  htmlFor="bio"
                  hint="Jedna věta. Plný popis a vizuál doladíš v editoru profilu."
                >
                  <textarea
                    id="bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                  />
                </Field>
              </div>
            </CardSection>
          </Card>

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
            >
              {submitting ? "Vytvářím…" : "Vytvořit komunitu"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
