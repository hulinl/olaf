"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type CostItemRow,
  type CostingResponse,
  auth,
  events,
} from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

/**
 * Kalkulace ekonomiky akce — plán vs skutečnost, break-even, marže,
 * P&L. Opt-in per akci (feature toggle). Owner-only.
 */
export default function CostingPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [data, setData] = useState<CostingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const r = await events.getCosting(wsSlug, eventSlug);
      setData(r);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(`/login?next=/admin/eventy/${wsSlug}/${eventSlug}/kalkulace`);
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        try {
          await auth.me();
          router.replace(`/admin/eventy/${wsSlug}/${eventSlug}`);
        } catch {
          router.replace(`/login?next=/admin/eventy/${wsSlug}/${eventSlug}/kalkulace`);
        }
        return;
      }
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug, eventSlug, router]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/eventy/${wsSlug}/${eventSlug}`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na akci
      </Link>

      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-brand">Kalkulace</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          Ekonomika akce
        </h1>
        <p className="text-sm text-ink-500">
          Sestav nákladovou kalkulaci, spočítej break-even + doporučenou
          cenu podle marže, a po akci vyhodnoť plán vs skutečnost.
          Funkce je volitelná — když ji nepotřebuješ, prostě ji nezapneš.
        </p>
      </header>

      <MetaEditor
        data={data}
        wsSlug={wsSlug}
        eventSlug={eventSlug}
        onSaved={reload}
      />

      {data.meta.enabled && (
        <>
          <SummaryDashboard data={data} />
          <ItemsSection
            data={data}
            wsSlug={wsSlug}
            eventSlug={eventSlug}
            onMutate={reload}
          />
          <div>
            <a
              href={`/api/events/${wsSlug}/${eventSlug}/costing.csv`}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
            >
              ↓ Stáhnout CSV
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function MetaEditor({
  data,
  wsSlug,
  eventSlug,
  onSaved,
}: {
  data: CostingResponse;
  wsSlug: string;
  eventSlug: string;
  onSaved: () => Promise<void>;
}) {
  const { meta } = data;
  const [enabled, setEnabled] = useState(meta.enabled);
  const [expected, setExpected] = useState(
    meta.expected_paying_count?.toString() ?? "",
  );
  const [margin, setMargin] = useState(meta.margin_pct ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await events.updateCostingMeta(wsSlug, eventSlug, {
        enabled,
        expected_paying_count: expected ? Number(expected) : null,
        margin_pct: margin || null,
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border text-brand focus-ring"
        />
        Zapnout kalkulaci pro tuto akci
      </label>
      {enabled && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Očekávaný počet platících účastníků"
            hint="Pro plánované náklady per-person + break-even."
            htmlFor="expected-count"
          >
            <Input
              id="expected-count"
              type="number"
              min="0"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="např. 15"
            />
          </Field>
          <Field
            label="Marže (%)"
            hint="Doporučená prodejní cena = break-even × (1 + marže/100)."
            htmlFor="margin-pct"
          >
            <Input
              id="margin-pct"
              type="number"
              step="0.01"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              placeholder="např. 20"
            />
          </Field>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      <div className="mt-4">
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={busy}
          onClick={save}
        >
          Uložit nastavení
        </Button>
      </div>
    </section>
  );
}

function SummaryDashboard({ data }: { data: CostingResponse }) {
  const s = data.summary;
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryTile
        label="Náklady — plán"
        value={s.plan_total}
        currency={s.currency}
        subtitle={`na ${s.expected_paying_count} očekávaných`}
      />
      <SummaryTile
        label="Náklady — skutečnost"
        value={s.actual_total}
        currency={s.currency}
        subtitle={`na ${s.paid_count} platících`}
      />
      <SummaryTile
        label="Break-even / osoba (plán)"
        value={s.break_even_per_person_plan}
        currency={s.currency}
      />
      <SummaryTile
        label="Break-even / osoba (skutečnost)"
        value={s.break_even_per_person_actual}
        currency={s.currency}
      />
      <SummaryTile
        label="Doporučená cena (s marží)"
        value={s.suggested_price}
        currency={s.currency}
        subtitle={
          s.current_price
            ? `aktuální cena akce: ${s.current_price} ${s.currency}`
            : undefined
        }
      />
      <SummaryTile
        label="Zisk / ztráta — plán"
        value={s.profit_plan}
        currency={s.currency}
        tone={profitTone(s.profit_plan)}
      />
      <SummaryTile
        label="Očekávané výnosy"
        value={s.expected_revenue}
        currency={s.currency}
      />
      <SummaryTile
        label="Skutečné výnosy"
        value={s.actual_revenue}
        currency={s.currency}
      />
      <SummaryTile
        label="Zisk / ztráta — skutečnost"
        value={s.profit_actual}
        currency={s.currency}
        tone={profitTone(s.profit_actual)}
      />
    </section>
  );
}

function profitTone(v: string | null): "success" | "danger" | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  if (n >= 0) return "success";
  return "danger";
}

function SummaryTile({
  label,
  value,
  currency,
  subtitle,
  tone,
}: {
  label: string;
  value: string | null;
  currency: string;
  subtitle?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={[
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "success"
            ? "text-success"
            : tone === "danger"
              ? "text-danger"
              : "text-ink-900",
        ].join(" ")}
      >
        {value !== null ? `${formatMoney(value)} ${currency}` : "—"}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>
      )}
    </div>
  );
}

function formatMoney(v: string): string {
  const n = Number(v);
  if (!isFinite(n)) return v;
  return n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ItemsSection({
  data,
  wsSlug,
  eventSlug,
  onMutate,
}: {
  data: CostingResponse;
  wsSlug: string;
  eventSlug: string;
  onMutate: () => Promise<void>;
}) {
  const confirmDialog = useConfirm();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  async function handleDelete(item: CostItemRow) {
    const ok = await confirmDialog({
      title: `Smazat řádek „${item.name}"?`,
      description: "Odstraníme ho z kalkulace. Nedá se vzít zpět.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await events.deleteCostItem(wsSlug, eventSlug, item.id);
      await onMutate();
    } catch {
      /* keep quiet */
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-ink-900">Nákladové řádky</h2>
      <p className="mt-1 text-sm text-ink-500">
        Přidávej řádky s plánovanou i skutečnou částkou. „Na osobu"
        typ se přenásobuje počtem (očekávaným pro plán, platících pro
        skutečnost).
      </p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60 text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-3 text-left">Název</th>
              <th className="px-4 py-3 text-left">Typ</th>
              <th className="px-4 py-3 text-right">Plán</th>
              <th className="px-4 py-3 text-right">Skutečnost</th>
              <th className="px-4 py-3 text-left">Poznámka</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.length === 0 && editingId !== "new" && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink-500">
                  Zatím žádné řádky. Přidej první níže.
                </td>
              </tr>
            )}
            {data.items.map((item) =>
              editingId === item.id ? (
                <ItemEditorRow
                  key={item.id}
                  initial={item}
                  currency={data.summary.currency}
                  onSave={async (values) => {
                    await events.updateCostItem(
                      wsSlug,
                      eventSlug,
                      item.id,
                      values,
                    );
                    setEditingId(null);
                    await onMutate();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={item.id} className="hover:bg-brand/5">
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {item.kind === "fixed" ? "Fixní" : "Na osobu"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.planned_amount !== null
                      ? formatMoney(item.planned_amount)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.actual_amount !== null
                      ? formatMoney(item.actual_amount)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {item.notes}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingId(item.id)}
                      className="text-xs font-medium text-ink-500 hover:text-brand"
                    >
                      Upravit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="ml-3 text-xs font-medium text-ink-500 hover:text-danger"
                    >
                      Smazat
                    </button>
                  </td>
                </tr>
              ),
            )}
            {editingId === "new" && (
              <ItemEditorRow
                initial={null}
                currency={data.summary.currency}
                onSave={async (values) => {
                  await events.createCostItem(wsSlug, eventSlug, values);
                  setEditingId(null);
                  await onMutate();
                }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </tbody>
        </table>
      </div>

      {editingId !== "new" && (
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          + Přidat řádek
        </button>
      )}
    </section>
  );
}

function ItemEditorRow({
  initial,
  currency,
  onSave,
  onCancel,
}: {
  initial: CostItemRow | null;
  currency: string;
  onSave: (values: {
    name: string;
    kind: "fixed" | "per_person";
    planned_amount: string | null;
    actual_amount: string | null;
    notes: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"fixed" | "per_person">(
    initial?.kind ?? "fixed",
  );
  const [planned, setPlanned] = useState(initial?.planned_amount ?? "");
  const [actual, setActual] = useState(initial?.actual_amount ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        name: name.trim(),
        kind,
        planned_amount: planned || null,
        actual_amount: actual || null,
        notes: notes.trim(),
      });
    } catch (e2) {
      setErr(
        e2 instanceof ApiError
          ? e2.firstFieldError() ?? e2.message
          : "Uložení selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="bg-brand/5">
      <td className="px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Např. Chata Bečva"
          required
          autoFocus
          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm focus-ring"
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "fixed" | "per_person")}
          className="rounded border border-border bg-surface px-2 py-1 text-xs focus-ring"
        >
          <option value="fixed">Fixní</option>
          <option value="per_person">Na osobu</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          value={planned}
          onChange={(e) => setPlanned(e.target.value)}
          placeholder={`0.00 ${currency}`}
          className="w-32 rounded border border-border bg-surface px-2 py-1 text-right text-sm tabular-nums focus-ring"
          type="number"
          step="0.01"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          placeholder={`0.00 ${currency}`}
          className="w-32 rounded border border-border bg-surface px-2 py-1 text-right text-sm tabular-nums focus-ring"
          type="number"
          step="0.01"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Poznámka"
          className="w-full rounded border border-border bg-surface px-2 py-1 text-xs focus-ring"
        />
      </td>
      <td className="px-2 py-3 text-right">
        <form onSubmit={submit} className="flex flex-col items-end gap-1">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={busy}
            disabled={busy || !name.trim()}
          >
            Uložit
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-ink-500 hover:text-ink-900"
          >
            Zrušit
          </button>
          {err && <p className="text-xs text-danger">{err}</p>}
        </form>
      </td>
    </tr>
  );
}
