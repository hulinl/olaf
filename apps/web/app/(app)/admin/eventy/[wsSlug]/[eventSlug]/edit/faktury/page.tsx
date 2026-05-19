"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/card";
import { ApiError, type Invoice, events, formatEventPrice } from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

const STATUS_LABEL: Record<Invoice["status"], string> = {
  draft: "Draft",
  issued: "Vystaveno",
  paid: "Zaplaceno",
  void: "Storno",
};

const STATUS_TONE: Record<Invoice["status"], string> = {
  draft: "bg-surface-muted text-ink-500",
  issued: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  void: "bg-danger-soft text-danger",
};

export default function FakturyListPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [list, setList] = useState<Invoice[] | null>(null);
  const [eventTitle, setEventTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Pull the event title for the breadcrumb in parallel with
    // the invoice list. Title swap is non-blocking — if it 404s
    // we fall back to the slug.
    events
      .publicEvent(wsSlug, eventSlug)
      .then((ev) => {
        if (!cancelled) setEventTitle(ev.title);
      })
      .catch(() => {
        /* fall back to slug below */
      });
    events
      .invoices(wsSlug, eventSlug)
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/eventy");
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
  }, [wsSlug, eventSlug, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Akce", href: "/admin/eventy" },
          {
            label: eventTitle || eventSlug,
            href: `/admin/eventy/${wsSlug}/${eventSlug}/edit`,
          },
          { label: "Faktury" },
        ]}
      />

      <header>
        <p className="text-sm font-medium text-brand">Faktury</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          Faktury k akci
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Vygenerované automaticky po označení platby jako zaplacené.
          Klikni na řádek pro detail a úpravu.
        </p>
      </header>

      {!list || list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Zatím žádné faktury
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Faktura se vygeneruje, jakmile platbu označíš jako zaplacenou
            v přehledu registrací.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Číslo</th>
                <th className="px-4 py-3">Odběratel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Částka</th>
                <th className="px-4 py-3">Vystaveno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((inv) => {
                const href = `/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury/${inv.id}`;
                return (
                  <tr
                    key={inv.id}
                    onClick={(e) => {
                      const t = e.target as HTMLElement;
                      if (t.closest("a, button")) return;
                      router.push(href);
                    }}
                    className="cursor-pointer hover:bg-brand/10"
                  >
                    <td className="px-4 py-3 font-mono text-ink-900">
                      <Link href={href} className="hover:underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-900">{inv.customer_name}</p>
                      <p className="text-xs text-ink-500">{inv.customer_email}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={[
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          STATUS_TONE[inv.status],
                        ].join(" ")}
                      >
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink-900">
                      {formatEventPrice(inv.total, inv.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-500">
                      {new Date(inv.issued_at).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
