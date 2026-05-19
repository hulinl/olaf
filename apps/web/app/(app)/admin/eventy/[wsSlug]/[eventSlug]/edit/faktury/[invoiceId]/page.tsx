"use client";

import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ApiError, type Invoice, assetUrl, events } from "@/lib/api";

interface Props {
  params: Promise<{
    wsSlug: string;
    eventSlug: string;
    invoiceId: string;
  }>;
}

/**
 * V1 minimum: a simple form for editing all snapshot fields. No PDF gen
 * yet (planned for V1.5 via WeasyPrint). Owner can fix supplier/customer
 * details or notes ex post — important because billing addresses change.
 */
export default function FakturaEditPage({ params }: Props) {
  const { wsSlug, eventSlug, invoiceId } = use(params);
  const router = useRouter();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    events
      .invoiceDetail(wsSlug, eventSlug, Number(invoiceId))
      .then((data) => {
        if (!cancelled) setInv(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury/${invoiceId}`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wsSlug, eventSlug, invoiceId, router]);

  function update<K extends keyof Invoice>(key: K, value: Invoice[K]) {
    setInv((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inv) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await events.updateInvoice(
        wsSlug,
        eventSlug,
        inv.id,
        inv,
      );
      setInv(updated);
      setSaved(true);
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error && !inv) return <Alert variant="danger">{error}</Alert>;
  if (!inv) return null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Eventy", href: "/admin/eventy" },
          { label: inv.event_title, href: `/admin/eventy/${wsSlug}/${eventSlug}/edit` },
          { label: "Faktury", href: `/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury` },
          { label: inv.number },
        ]}
      />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand">Faktura {inv.number}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            {inv.customer_name}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {inv.event_title} · {inv.user_email}
          </p>
        </div>
        <a
          href={assetUrl(
            `/api/events/${wsSlug}/${eventSlug}/invoices/${inv.id}/pdf/`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted focus-ring"
        >
          Stáhnout PDF ↓
        </a>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Section title="Dodavatel">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Název" htmlFor="sn">
              <Input
                id="sn"
                value={inv.supplier_name}
                onChange={(e) => update("supplier_name", e.target.value)}
              />
            </Field>
            <Field label="IČO" htmlFor="sico">
              <Input
                id="sico"
                value={inv.supplier_ico}
                onChange={(e) => update("supplier_ico", e.target.value)}
              />
            </Field>
            <Field label="DIČ" htmlFor="sdic">
              <Input
                id="sdic"
                value={inv.supplier_dic}
                onChange={(e) => update("supplier_dic", e.target.value)}
              />
            </Field>
            <Field label="IBAN" htmlFor="siban">
              <Input
                id="siban"
                value={inv.supplier_iban}
                onChange={(e) => update("supplier_iban", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Adresa" htmlFor="sadr">
                <textarea
                  id="sadr"
                  rows={3}
                  value={inv.supplier_address}
                  onChange={(e) => update("supplier_address", e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Odběratel">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Jméno / firma" htmlFor="cn">
              <Input
                id="cn"
                value={inv.customer_name}
                onChange={(e) => update("customer_name", e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="cmail">
              <Input
                id="cmail"
                type="email"
                value={inv.customer_email}
                onChange={(e) => update("customer_email", e.target.value)}
              />
            </Field>
            <Field label="IČO" htmlFor="cico">
              <Input
                id="cico"
                value={inv.customer_ico}
                onChange={(e) => update("customer_ico", e.target.value)}
              />
            </Field>
            <Field label="DIČ" htmlFor="cdic">
              <Input
                id="cdic"
                value={inv.customer_dic}
                onChange={(e) => update("customer_dic", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Adresa" htmlFor="cadr">
                <textarea
                  id="cadr"
                  rows={3}
                  value={inv.customer_address}
                  onChange={(e) => update("customer_address", e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Částky">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Celkem" htmlFor="total">
              <Input
                id="total"
                type="number"
                step="0.01"
                value={inv.total}
                onChange={(e) => update("total", e.target.value)}
              />
            </Field>
            <Field label="DPH %" htmlFor="vat">
              <Input
                id="vat"
                type="number"
                step="0.01"
                value={inv.vat_rate}
                onChange={(e) => update("vat_rate", e.target.value)}
              />
            </Field>
            <Field label="Měna" htmlFor="cur">
              <Input
                id="cur"
                maxLength={3}
                value={inv.currency}
                onChange={(e) =>
                  update("currency", e.target.value.toUpperCase().slice(0, 3))
                }
              />
            </Field>
            <Field label="Variabilní symbol" htmlFor="vs">
              <Input
                id="vs"
                value={inv.variable_symbol}
                onChange={(e) => update("variable_symbol", e.target.value)}
              />
            </Field>
            <Field label="Status" htmlFor="st">
              <select
                id="st"
                value={inv.status}
                onChange={(e) =>
                  update("status", e.target.value as Invoice["status"])
                }
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm focus-ring"
              >
                <option value="draft">Draft</option>
                <option value="issued">Vystaveno</option>
                <option value="paid">Zaplaceno</option>
                <option value="void">Storno</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Poznámka">
          <textarea
            rows={4}
            value={inv.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
            placeholder="Volitelná poznámka, kterou si necháváš na faktuře."
          />
        </Section>

        {error && <Alert variant="danger">{error}</Alert>}
        {saved && !error && (
          <Alert variant="success">Faktura uložena.</Alert>
        )}

        <div>
          <Button type="submit" variant="primary" size="lg" loading={saving}>
            {saving ? "Ukládám…" : "Uložit fakturu"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-ink-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
