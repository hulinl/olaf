"use client";

import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { ApiError, type APITokenInfo, auth } from "@/lib/api";

/**
 * /settings/integrace — connect third-party tools.
 *
 * Two cards: Notion (fetch event-source pages) and Anthropic API
 * (LLM extraction). Per-user — each creator's LLM calls bill to
 * their own Anthropic account, no platform-wide key.
 *
 * The token field is always blank on load because the backend never
 * echoes the stored value. Only "Připojeno / Nepřipojeno" reflects
 * the saved state.
 */
export default function IntegrationsSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Integrace</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
          Propojení s dalšími nástroji
        </h2>
        <p className="mt-2 max-w-2xl text-ink-500">
          Pro funkci „Vytvořit event z odkazu" potřebuješ propojit dvě
          služby: <strong>Notion</strong> (odkud Olaf načte tvoje
          poznámky) a <strong>Anthropic</strong> (model, který poznámky
          převede do polí akce). Obě nastavíš tady — vygeneruješ klíče
          v jejich webech a vložíš sem.
        </p>
      </header>

      <IntegrationCard
        title="Notion"
        description="Olaf přes tvoji integraci načte stránky, které jí v Notionu přidáš jako Connection. Obsah pak pošle do Claude, který ho rozparsuje do polí akce."
        get={() => auth.getNotionIntegration()}
        save={(token) => auth.setNotionIntegration(token)}
        remove={() => auth.removeNotionIntegration()}
        placeholder="secret_…"
        instructions={
          <>
            <li>
              Otevři{" "}
              <a
                href="https://www.notion.so/profile/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline"
              >
                notion.so/profile/integrations
              </a>{" "}
              → <strong>+ New integration</strong>. Type:{" "}
              <em>Internal</em>, capabilities: <em>Read content</em>.
            </li>
            <li>
              Zkopíruj vygenerovaný token (začíná{" "}
              <code className="rounded bg-surface-muted px-1 font-mono text-xs">
                secret_
              </code>{" "}
              nebo{" "}
              <code className="rounded bg-surface-muted px-1 font-mono text-xs">
                ntn_
              </code>
              ) a vlož ho do políčka níž.
            </li>
            <li>
              U každé Notion stránky, kterou má Olaf umět načíst,
              v Notionu otevři ⋯ → <em>Connections</em> → vyber svoji
              integraci. Bez tohoto kroku Notion vrátí 404.
            </li>
          </>
        }
      />

      <ApiTokensCard />

      <IntegrationCard
        title="Anthropic API"
        description="Klíč jde do tvého účtu — každé volání modelu se účtuje tobě. Olaf si platformový klíč nedrží, takže máš plnou kontrolu nad útratou (typicky pár centů na akci)."
        get={() => auth.getAnthropicIntegration()}
        save={(token) => auth.setAnthropicIntegration(token)}
        remove={() => auth.removeAnthropicIntegration()}
        placeholder="sk-ant-…"
        instructions={
          <>
            <li>
              Otevři{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline"
              >
                console.anthropic.com → API Keys
              </a>{" "}
              → <strong>Create Key</strong>. Pojmenuj klíč třeba „olaf".
            </li>
            <li>
              Zkopíruj klíč (začíná{" "}
              <code className="rounded bg-surface-muted px-1 font-mono text-xs">
                sk-ant-
              </code>
              ) — Anthropic ti ho ukáže jen jednou.
            </li>
            <li>
              Vlož ho do políčka níž. Olaf ho šifrovaně uloží a používá
              jen při ingestu z odkazu.
            </li>
          </>
        }
      />
    </div>
  );
}

/**
 * API tokeny pro externí klienty (Claude Code skill v mountain-guide,
 * vlastní CLI nástroje, CI). Token = Bearer credential pro
 * `Authorization: Bearer <token>` na všechny `/api/...` endpointy.
 *
 * Plaintext klíč se zobrazí jen jednou — při vytvoření. Pak ho
 * backend nikdy nevrací; v listu vidíš pouze prefix (prvních 8
 * znaků) pro identifikaci. Revokace je soft (zachováme řádek pro
 * audit), ale token okamžitě přestane fungovat.
 */
function ApiTokensCard() {
  const [tokens, setTokens] = useState<APITokenInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const confirmDialog = useConfirm();

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    try {
      const list = await auth.listApiTokens();
      setTokens(list);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Načtení tokenů selhalo.",
      );
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const created = await auth.createApiToken(trimmed);
      setJustCreatedKey(created.key);
      setLabel("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Vytvoření tokenu selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: number, name: string) {
    const ok = await confirmDialog({
      title: `Zrušit token „${name}"?`,
      description:
        "Externí klient s tímto tokenem okamžitě přestane fungovat. Akce se nedá vrátit — pokud token potřebuješ znovu, musíš vystavit nový.",
      confirmLabel: "Zrušit token",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await auth.revokeApiToken(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revokace selhala.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!justCreatedKey) return;
    try {
      await navigator.clipboard.writeText(justCreatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (insecure context, denied permission).
      // The plaintext is still visible in the page, so the user can
      // copy by hand.
    }
  }

  const active = (tokens ?? []).filter((t) => t.is_active);
  const revoked = (tokens ?? []).filter((t) => !t.is_active);

  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink-900">
              API tokeny
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Tokeny pro externí klienty, kteří nahrávají eventy přes API
              — typicky <strong>Claude Code skill</strong> v projektu
              jako <code className="rounded bg-surface-muted px-1 font-mono text-xs">mountain-guide</code>{" "}
              nebo vlastní CLI nástroje. Každý nástroj měj samostatný
              token, ať revokace jednoho nezasáhne ostatní.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3">
            <Alert variant="danger">
              <span className="whitespace-pre-line">{error}</span>
            </Alert>
          </div>
        )}

        {justCreatedKey && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3">
            <p className="text-sm font-medium text-ink-900">
              Token vytvořen. Tohle je <strong>jediná chvíle</strong>,
              kdy ho uvidíš celý — uložte si ho teď.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-ink-900 px-3 py-2 font-mono text-xs text-white">
                {justCreatedKey}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={copyKey}
              >
                {copied ? "Zkopírováno ✓" : "Kopírovat"}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setJustCreatedKey(null)}
              className="mt-3 text-xs font-medium text-ink-500 hover:text-ink-700"
            >
              Schovat
            </button>
          </div>
        )}

        <form
          onSubmit={handleCreate}
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field
              label="Název tokenu"
              htmlFor="api-token-label"
              hint='Krátký popisek — např. "mountain-guide laptop" nebo "CI deploy".'
            >
              <input
                id="api-token-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="mountain-guide laptop"
                maxLength={80}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={busy}
            disabled={!label.trim()}
          >
            Vytvořit token
          </Button>
        </form>

        {tokens === null ? (
          <p className="mt-6 text-sm text-ink-500">Načítám…</p>
        ) : tokens.length === 0 ? (
          <p className="mt-6 text-sm text-ink-500">
            Zatím nemáš žádné tokeny. Vytvoř první výš.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {active.length > 0 && (
              <ul className="flex flex-col gap-2">
                {active.map((t) => (
                  <TokenRow
                    key={t.id}
                    token={t}
                    onRevoke={() => handleRevoke(t.id, t.label)}
                  />
                ))}
              </ul>
            )}
            {revoked.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-500 hover:text-ink-700">
                  Zrušené ({revoked.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {revoked.map((t) => (
                    <TokenRow key={t.id} token={t} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <p className="mt-6 text-xs text-ink-500">
          Jak token použít: viz{" "}
          <code className="rounded bg-surface-muted px-1 font-mono text-[11px]">
            docs/integrations/mountain-guide/README.md
          </code>{" "}
          v OLAF repozitáři.
        </p>
      </CardSection>
    </Card>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: APITokenInfo;
  onRevoke?: () => void;
}) {
  const created = new Date(token.created_at).toLocaleDateString("cs-CZ");
  const lastUsed = token.last_used_at
    ? new Date(token.last_used_at).toLocaleString("cs-CZ", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Nepoužitý";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-ink-900">
            {token.label}
          </span>
          <code className="font-mono text-xs text-ink-500">
            {token.prefix}…
          </code>
          {!token.is_active && (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
              Zrušeno
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          Vytvořen {created} · Naposledy použit: {lastUsed}
        </p>
      </div>
      {onRevoke && (
        <button
          type="button"
          onClick={onRevoke}
          className="text-xs font-medium text-ink-500 hover:text-danger"
        >
          Zrušit
        </button>
      )}
    </li>
  );
}

interface IntegrationCardProps {
  title: string;
  description: string;
  placeholder: string;
  instructions: ReactNode;
  get: () => Promise<{ connected: boolean }>;
  save: (token: string) => Promise<{ connected: boolean }>;
  remove: () => Promise<{ connected: boolean }>;
}

function IntegrationCard({
  title,
  description,
  placeholder,
  instructions,
  get,
  save,
  remove,
}: IntegrationCardProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  useEffect(() => {
    get()
      .then((r) => setConnected(r.connected))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Načtení selhalo."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await save(token.trim());
      setConnected(r.connected);
      setToken("");
      setMsg(`${title} uloženo.`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    const ok = await confirmDialog({
      title: `Odpojit ${title}?`,
      description:
        "Token z databáze smažeme. Aplikace co se na něj váže přestane fungovat — pokud ho potřebuješ znovu, musíš ho zase vložit.",
      confirmLabel: "Odpojit",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await remove();
      setConnected(r.connected);
      setMsg(`${title} odpojeno.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Odpojení selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink-900">{title}</h3>
            <p className="mt-1 text-sm text-ink-500">{description}</p>
          </div>
          <span
            className={[
              "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              connected
                ? "bg-success/15 text-success"
                : "bg-surface-muted text-ink-500",
            ].join(" ")}
          >
            {connected === null
              ? "…"
              : connected
                ? "Připojeno"
                : "Nepřipojeno"}
          </span>
        </div>

        {error && (
          <div className="mt-3">
            <Alert variant="danger">
              <span className="whitespace-pre-line">{error}</span>
            </Alert>
          </div>
        )}
        {msg && (
          <p className="mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
            {msg}
          </p>
        )}

        <ol className="mt-4 ml-4 list-decimal space-y-2 text-sm text-ink-700">
          {instructions}
        </ol>

        <form
          onSubmit={handleSave}
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field
              label="Token / API key"
              htmlFor={`${title}-token`}
              hint="Token nikdy nezobrazujeme zpět — je v DB šifrovaný. Pro rotaci vlož nový."
            >
              <input
                id={`${title}-token`}
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-ink-900 focus-ring"
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={busy}
            disabled={!token.trim()}
          >
            {connected ? "Aktualizovat" : "Připojit"}
          </Button>
        </form>

        {connected && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="mt-3 text-xs font-medium text-ink-500 hover:text-danger disabled:opacity-50"
          >
            Odpojit
          </button>
        )}
      </CardSection>
    </Card>
  );
}
