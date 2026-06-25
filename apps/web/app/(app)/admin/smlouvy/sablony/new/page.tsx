"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type Workspace,
  contracts as contractsApi,
  workspaces,
} from "@/lib/api";

export default function NewTemplatePage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaces.mine().then((mine) => {
      if (cancelled) return;
      const owned = mine.filter((w) => w.my_role === "owner");
      if (owned.length > 0) setWorkspace(owned[0]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await contractsApi.createTemplate(workspace.slug, {
        name,
        description,
        notion_url: notionUrl,
      });
      router.push(`/admin/smlouvy/sablony/${created.id}`);
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
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Smlouvy", href: "/admin/smlouvy" },
          { label: "Nová šablona" },
        ]}
      />
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          Nová šablona smlouvy
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Pojmenuj šablonu a (volitelně) připoj Notion URL — po vytvoření
          tě pustím do editoru, kde můžeš tělo upravit a syncnout
          z Notionu.
        </p>
      </header>

      <Card>
        <CardSection>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Název šablony" htmlFor="name">
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Smlouva o účasti na kempu"
              />
            </Field>
            <Field
              label="Popis (interní)"
              htmlFor="description"
              hint="Krátký kontext pro budoucí tebe — kdy tuhle šablonu použít."
            >
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pro vícedenní kempy s instruktorským dohledem."
              />
            </Field>
            <Field
              label="Notion URL (volitelně)"
              htmlFor="notion_url"
              hint={
                'Po vytvoření klikni „Sync z Notion" v editoru — Claude ' +
                "vytáhne text smlouvy z Notion stránky a uloží jako HTML."
              }
            >
              <Input
                id="notion_url"
                type="url"
                value={notionUrl}
                onChange={(e) => setNotionUrl(e.target.value)}
                placeholder="https://notion.so/ws/Smlouva-…"
              />
            </Field>

            {error && <Alert variant="danger">{error}</Alert>}

            <div className="flex gap-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
              >
                {submitting ? "Vytvářím…" : "Vytvořit šablonu"}
              </Button>
            </div>
          </form>
        </CardSection>
      </Card>
    </div>
  );
}
