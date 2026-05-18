"use client";

import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type Community,
  type Workspace,
  communities as communitiesApi,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function NewCommunityPage({ params }: Props) {
  const { slug: workspaceSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [communitySlug, setCommunitySlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] =
    useState<Community["visibility"]>("private");
  const [policy, setPolicy] =
    useState<Community["membership_policy"]>("approval");

  useEffect(() => {
    let cancelled = false;
    workspaces
      .detail(workspaceSlug)
      .then((ws) => {
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/workspaces/${workspaceSlug}`);
          return;
        }
        setWorkspace(ws);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/workspaces");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, router]);

  function updateName(value: string) {
    setName(value);
    if (!slugTouched) setCommunitySlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const c = await communitiesApi.create(workspaceSlug, {
        slug: communitySlug,
        name,
        description,
        visibility,
        membership_policy: policy,
      });
      router.push(`/workspaces/${workspaceSlug}/communities/${c.slug}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení selhalo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!workspace && !error) {
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
            { label: workspace.name, href: `/workspaces/${workspaceSlug}` },
            { label: "Nová komunita" },
          ]}
        />

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Nová komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            Vytvoř komunitu
          </h1>
          <p className="mt-2 text-ink-500">
            Komunita = roster lidí pod workspacem {workspace.name}. Členy
            přidáš později, akce do ní budeš sdílet při editaci eventu.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">
                Základní info
              </h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Název *" htmlFor="name">
                    <Input
                      id="name"
                      required
                      value={name}
                      onChange={(e) => updateName(e.target.value)}
                      placeholder="Beskydská běžecká parta"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Slug *"
                    htmlFor="slug"
                    hint={`URL bude /workspaces/${workspaceSlug}/communities/${communitySlug || "<slug>"}`}
                  >
                    <Input
                      id="slug"
                      required
                      value={communitySlug}
                      onChange={(e) => {
                        setCommunitySlug(e.target.value);
                        setSlugTouched(true);
                      }}
                      placeholder="beskydska-bezecka-parta"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Popis" htmlFor="desc">
                    <textarea
                      id="desc"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                    />
                  </Field>
                </div>
              </div>
            </CardSection>
          </Card>

          <Card>
            <CardSection>
              <h2 className="text-base font-semibold text-ink-900">
                Viditelnost a členství
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    Viditelnost
                  </p>
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    {(["private", "unlisted", "public"] as const).map((v) => (
                      <label key={v} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="vis"
                          checked={visibility === v}
                          onChange={() => setVisibility(v)}
                          className="accent-brand"
                        />
                        {v === "private"
                          ? "Soukromá — pouze členové"
                          : v === "unlisted"
                            ? "Skrytá — jen přes odkaz"
                            : "Veřejná — kdokoli si požádá"}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    Vstup do komunity
                  </p>
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="policy"
                        checked={policy === "approval"}
                        onChange={() => setPolicy("approval")}
                        className="accent-brand"
                      />
                      Approval-based — žádost → schválíš
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="policy"
                        checked={policy === "invite_only"}
                        onChange={() => setPolicy("invite_only")}
                        className="accent-brand"
                      />
                      Invite-only — pozveš emailem
                    </label>
                  </div>
                </div>
              </div>
            </CardSection>
          </Card>

          {error && <Alert variant="danger">{error}</Alert>}

          <div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
            >
              {submitting ? "Ukládám…" : "Vytvořit komunitu"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
