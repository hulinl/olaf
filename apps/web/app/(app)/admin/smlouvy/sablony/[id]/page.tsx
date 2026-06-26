"use client";

import { useRouter } from "next/navigation";
import {
  FormEvent,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type ContractTemplate,
  type Workspace,
  contracts as contractsApi,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

const PLACEHOLDERS = [
  "ucastnik_jmeno",
  "ucastnik_email",
  "ucastnik_telefon",
  "ucastnik_adresa",
  "ucastnik_datum_narozeni",
  "event_titul",
  "event_datum",
  "event_misto",
  "event_cena",
  "workspace_jmeno",
  "datum_dnes",
];

/** Mock data co se v náhledu propíše do placeholderů — aby uživatel
 *  viděl, jak smlouva bude vypadat až ji dostane účastník. Reálná
 *  substituce probíhá na backendu při generování PDF. */
const PREVIEW_VALUES: Record<string, string> = {
  ucastnik_jmeno: "Jan Novák",
  ucastnik_email: "jan.novak@example.com",
  ucastnik_telefon: "+420 777 123 456",
  ucastnik_adresa: "Hlavní 12, Praha, 11000",
  ucastnik_datum_narozeni: "15. 3. 1990",
  event_titul: "Spring Camp Beskydy",
  event_datum: "16.–19. května 2026",
  event_misto: "Beskydy, ČR",
  event_cena: "2 500 CZK",
  workspace_jmeno: "Olaf Adventures",
  datum_dnes: new Date().toLocaleDateString("cs-CZ"),
};

function renderPreview(html: string): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = PREVIEW_VALUES[key];
    if (value === undefined) {
      return `<mark style="background:#fff3cd;padding:0 2px;">{{${key}}}</mark>`;
    }
    return `<strong style="color:#155724;background:#d4edda;padding:0 2px;border-radius:2px;">${value}</strong>`;
  });
}

export default function TemplateEditPage({ params }: Props) {
  const { id } = use(params);
  const templateId = parseInt(id, 10);
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [template, setTemplate] = useState<ContractTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const previewHtml = useMemo(() => renderPreview(bodyHtml), [bodyHtml]);

  function insertPlaceholder(key: string) {
    const token = `{{${key}}}`;
    const ta = bodyRef.current;
    if (!ta) {
      setBodyHtml((prev) => prev + token);
      return;
    }
    const start = ta.selectionStart ?? bodyHtml.length;
    const end = ta.selectionEnd ?? bodyHtml.length;
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
    setBodyHtml(next);
    // Po re-render přesuneme kurzor za vložený placeholder.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await workspaces.mine();
        const owned = mine.filter((w) => w.my_role === "owner");
        if (cancelled || owned.length === 0) return;
        const home = owned[0];
        setWorkspace(home);
        const t = await contractsApi.templateDetail(home.slug, templateId);
        if (cancelled) return;
        setTemplate(t);
        setName(t.name);
        setDescription(t.description);
        setNotionUrl(t.notion_url);
        setBodyHtml(t.body_html);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/smlouvy");
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/smlouvy");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workspace || !template) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await contractsApi.updateTemplate(
        workspace.slug,
        templateId,
        { name, description, notion_url: notionUrl, body_html: bodyHtml },
      );
      setTemplate(updated);
      setSaved(true);
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

  async function onSyncFromNotion() {
    if (!workspace || !notionUrl.trim()) return;
    const ok = await confirmDialog({
      title: "Načíst znovu z Notion?",
      description:
        "Přepíše současné body HTML obsahem z Notion stránky (přes Claude). Tvoje úpravy se ztratí.",
      confirmLabel: "Načíst",
    });
    if (!ok) return;
    setSyncing(true);
    setError(null);
    try {
      // Uložíme notion_url poprvé pokud se změnilo, ať sync ho vidí.
      if (template && template.notion_url !== notionUrl) {
        await contractsApi.updateTemplate(workspace.slug, templateId, {
          notion_url: notionUrl,
        });
      }
      const synced = await contractsApi.syncTemplateFromNotion(
        workspace.slug,
        templateId,
      );
      setTemplate(synced);
      setBodyHtml(synced.body_html);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.data?.detail as string) || err.message;
        const missing = err.data?.missing;
        setError(
          missing
            ? `${detail} Otevři Nastavení → Integrace.`
            : detail,
        );
      } else {
        setError("Sync selhal.");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function onDelete() {
    if (!workspace || !template) return;
    const ok = await confirmDialog({
      title: `Smazat šablonu „${template.name}"?`,
      description:
        "Akce je nevratná. Pokud šablonu používá nějaký event, smazání nepůjde — nejdřív ji od eventu odpoj.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await contractsApi.deleteTemplate(workspace.slug, templateId);
      router.push("/admin/smlouvy");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    }
  }

  if (!template || !workspace) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Smlouvy", href: "/admin/smlouvy" },
          { label: template.name },
        ]}
      />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {template.name}
          </h1>
          {template.last_synced_at && (
            <p className="mt-1 text-xs text-ink-500">
              Z Notionu naposled syncnuto{" "}
              {new Date(template.last_synced_at).toLocaleString("cs-CZ")}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={onDelete}
        >
          Smazat
        </Button>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardSection>
            <h2 className="text-base font-semibold text-ink-900">Základ</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Název šablony" htmlFor="name">
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Interní popis" htmlFor="description">
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </div>
          </CardSection>
        </Card>

        <Card>
          <CardSection>
            <h2 className="text-base font-semibold text-ink-900">
              Notion zdroj
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Když je nastavený, klik „Načíst z Notion" stáhne aktuální
              text stránky přes Claude a přepíše tělo smlouvy. Pak ho
              tady ručně doupravíš.
            </p>
            <div className="mt-4"><Field label="Notion URL" htmlFor="notion_url">
              <Input
                id="notion_url"
                type="url"
                value={notionUrl}
                onChange={(e) => setNotionUrl(e.target.value)}
                placeholder="https://notion.so/ws/Smlouva-…"
              />
            </Field></div>
            <div className="mt-4">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onSyncFromNotion}
                disabled={!notionUrl.trim() || syncing}
                loading={syncing}
              >
                {syncing ? "Synchronizuji…" : "Načíst z Notion"}
              </Button>
            </div>
          </CardSection>
        </Card>

        <Card>
          <CardSection>
            <h2 className="text-base font-semibold text-ink-900">
              Tělo smlouvy
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Vlevo HTML obsah s placeholdery typu{" "}
              <code className="rounded bg-surface-muted px-1">
                {"{{"}ucastnik_jmeno{"}}"}
              </code>
              . Vpravo živý náhled — placeholdery jsou nahrazené
              ukázkovými daty (Jan Novák, Spring Camp Beskydy, …),
              ať vidíš, jak smlouva bude vypadat. Při generování PDF
              backend místo nich dosadí reálná data účastníka a akce.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-ink-500">
                Vložit:
              </span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertPlaceholder(p)}
                  className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-700 hover:bg-surface-muted"
                  title="Vložit na pozici kurzoru"
                >
                  {"{{"}{p}{"}}"}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <label
                  htmlFor="body_html"
                  className="mb-1 block text-xs font-medium text-ink-500"
                >
                  HTML zdroj
                </label>
                <textarea
                  id="body_html"
                  ref={bodyRef}
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  rows={24}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink-900 focus-ring"
                  placeholder="<h2>Smlouva o účasti</h2>&#10;<p>Mezi pořadatelem {{workspace_jmeno}} a {{ucastnik_jmeno}}…</p>"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">
                  Náhled (Jan Novák · Spring Camp Beskydy)
                </label>
                <div
                  className="prose prose-sm max-w-none rounded-md border border-border bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-900"
                  style={{
                    minHeight: "24rem",
                    maxHeight: "32rem",
                    overflowY: "auto",
                  }}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html:
                      previewHtml ||
                      '<p style="color:#888;font-style:italic;">Náhled se objeví, jakmile něco vyplníš.</p>',
                  }}
                />
              </div>
            </div>
          </CardSection>
        </Card>

        {error && <Alert variant="danger">{error}</Alert>}
        {saved && (
          <Alert variant="success">Uloženo. Šablona je připravená.</Alert>
        )}

        <div className="flex gap-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
          >
            {submitting ? "Ukládám…" : "Uložit změny"}
          </Button>
        </div>
      </form>
    </div>
  );
}
