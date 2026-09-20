"use client";

import { useEffect, useState } from "react";

import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type Workspace,
  workspaces as workspacesApi,
} from "@/lib/api";

/**
 * Platby — manual Fio CSV reconciliation. V1.5 path to "auto" without
 * a Fio webhook. Owner downloads their account's "Stažení v CSV" from
 * internetbanking, uploads here, every credit with a matching variable
 * symbol flips its RSVP to paid (and auto-generates the invoice).
 */
export default function AdminPlatbyPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workspacesApi
      .mine()
      .then((list) => {
        // Owner/admin only — the reconcile endpoint enforces this, but
        // we hide the workspaces we can't act on so the picker isn't
        // misleading.
        const filtered = list.filter(
          (w) => w.my_role === "owner" || w.my_role === "admin",
        );
        setWorkspaces(filtered);
        if (filtered.length === 1) setSelectedSlug(filtered[0].slug);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Načtení selhalo."),
      );
  }, []);

  if (workspaces === null) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Platby</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Párování z bankovního výpisu
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Nahraj CSV výpis z Fio (Účet → Stažení v CSV) a automaticky
          označíme jako zaplacené všechny registrace, jejichž variabilní
          symbol najdeme v příchozích platbách. Faktury se vystaví samy.
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      {workspaces.length === 0 ? (
        <Card>
          <CardSection>
            <p className="text-sm text-ink-500">
              Nejsi vlastník ani admin žádné komunity, takže není kde párovat
              platby.
            </p>
          </CardSection>
        </Card>
      ) : (
        <>
          {workspaces.length > 1 && (
            <Card>
              <CardSection>
                <label
                  htmlFor="ws-select"
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500"
                >
                  Komunita
                </label>
                <select
                  id="ws-select"
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
                >
                  <option value="">— vyber komunitu —</option>
                  {workspaces.map((w) => (
                    <option key={w.slug} value={w.slug}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </CardSection>
            </Card>
          )}
          {selectedSlug && <ReconcilePanel wsSlug={selectedSlug} />}
        </>
      )}
    </div>
  );
}

interface FioTx {
  date: string | null;
  amount: string;
  variable_symbol: string;
  message: string;
  counterparty: string;
}

interface MatchedRow {
  tx: FioTx;
  rsvp_id: number;
  event_title: string;
  user_full_name: string;
  user_email: string;
  amount_mismatch: boolean;
}

interface ReconcileResponse {
  total_rows: number;
  credits: number;
  matched: MatchedRow[];
  unmatched: FioTx[];
  already_paid: FioTx[];
}

function ReconcilePanel({ wsSlug }: { wsSlug: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReconcileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await workspacesApi.reconcilePayments(wsSlug, file);
      setResult(r);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Načtení výpisu selhalo.",
      );
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <Card>
      <CardSection>
        <h2 className="text-base font-semibold text-ink-900">
          Nahrát Fio výpis
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Soubor je třeba stáhnout přes Fio internetbanking →{" "}
          <span className="font-mono">Účet → Pohyby → Stažení v CSV</span>.
          Spárujeme každou příchozí platbu, kde variabilní symbol odpovídá
          nějaké zatím nezaplacené registraci v této komunitě.
        </p>

        <label
          className={[
            "mt-4 flex flex-col items-start gap-2 rounded-md border border-dashed border-border-strong bg-surface-muted/30 p-4 text-sm",
            busy ? "opacity-60" : "cursor-pointer hover:border-brand",
          ].join(" ")}
        >
          <span className="font-medium text-ink-900">
            {busy ? "Zpracovávám výpis…" : "Vyber CSV soubor"}
          </span>
          <span className="text-xs text-ink-500">
            Podporujeme UTF-8 i windows-1250, středník i čárku jako oddělovač.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={handleFile}
            className="hidden"
          />
        </label>

        {error && (
          <div className="mt-3">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {result && <ReconcileResults result={result} />}
      </CardSection>
    </Card>
  );
}

function ReconcileResults({ result }: { result: ReconcileResponse }) {
  return (
    <div className="mt-5 flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Řádků" value={String(result.credits)} />
        <StatTile
          label="Spárováno"
          value={String(result.matched.length)}
          tone={result.matched.length > 0 ? "success" : undefined}
        />
        <StatTile
          label="Nespárováno"
          value={String(result.unmatched.length)}
          tone={result.unmatched.length > 0 ? "warning" : undefined}
        />
        <StatTile
          label="Už zaplacené"
          value={String(result.already_paid.length)}
        />
      </div>

      {result.matched.length > 0 && (
        <ResultsTable
          title="Spárované platby"
          accent="success"
          empty="Žádné nové platby k označení."
          rows={result.matched.map((m) => ({
            key: `m-${m.rsvp_id}`,
            cells: [
              m.tx.date || "—",
              `${m.tx.amount} CZK`,
              m.tx.variable_symbol,
              `${m.user_full_name || m.user_email} — ${m.event_title}`,
              m.amount_mismatch ? "⚠ jiná částka" : "✓",
            ],
          }))}
        />
      )}

      {result.unmatched.length > 0 && (
        <ResultsTable
          title="Nespárované platby"
          accent="warning"
          empty="Všechno spárováno."
          rows={result.unmatched.map((t, i) => ({
            key: `u-${i}`,
            cells: [
              t.date || "—",
              `${t.amount} CZK`,
              t.variable_symbol || "—",
              t.message || t.counterparty || "",
              "Neexistující VS",
            ],
          }))}
        />
      )}

      {result.already_paid.length > 0 && (
        <ResultsTable
          title="Už zaplacené (přeskočeno)"
          accent="muted"
          empty="Nic."
          rows={result.already_paid.map((t, i) => ({
            key: `p-${i}`,
            cells: [
              t.date || "—",
              `${t.amount} CZK`,
              t.variable_symbol,
              t.message || t.counterparty || "",
              "Už paid",
            ],
          }))}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div
      className={[
        "flex flex-col gap-1 rounded-xl border bg-surface px-3 py-2",
        tone === "success"
          ? "border-success/40"
          : tone === "warning"
            ? "border-warning/40"
            : "border-border",
      ].join(" ")}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={[
          "text-2xl font-semibold tabular-nums",
          tone === "success"
            ? "text-success"
            : tone === "warning"
              ? "text-warning"
              : "text-ink-900",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function ResultsTable({
  title,
  accent,
  empty,
  rows,
}: {
  title: string;
  accent: "success" | "warning" | "muted";
  empty: string;
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <div>
      <p
        className={[
          "text-[10px] font-semibold uppercase tracking-[0.16em]",
          accent === "success"
            ? "text-success"
            : accent === "warning"
              ? "text-warning"
              : "text-ink-500",
        ].join(" ")}
      >
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2 text-right">Částka</th>
                <th className="px-3 py-2">VS</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key}>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={[
                        "px-3 py-2 align-top",
                        i === 1 ? "text-right font-mono tabular-nums" : "",
                      ].join(" ")}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
