"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { ApiError, type EventDocument, events } from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

type Filter = "all" | "pending" | "verified" | "rejected";

const STATUS_LABEL: Record<EventDocument["status"], string> = {
  pending: "Čeká na review",
  verified: "Schváleno",
  rejected: "Zamítnuto",
};

const STATUS_BADGE: Record<EventDocument["status"], string> = {
  pending: "bg-warning/15 text-warning",
  verified: "bg-success/15 text-success",
  rejected: "bg-danger-soft text-danger",
};

/**
 * Owner-side bulk view nahraných dokumentů pro daný event.
 *
 * Účastníci nahrávají dokumenty (např. doklad o pojištění) přes svoji
 * stránku registrace. Tady je owner schvaluje nebo zamítá s textovým
 * důvodem — backend pak účastníkovi pošle e-mail s informací co je
 * špatně a může nahrát znovu.
 */
export default function EventDocumentsPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [docs, setDocs] = useState<EventDocument[] | null>(null);
  const [requiredKeys, setRequiredKeys] = useState<
    { key: string; label: string; required: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<EventDocument | null>(null);
  const confirmDialog = useConfirm();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await events.listEventDocuments(wsSlug, eventSlug);
        if (cancelled) return;
        setDocs(resp.documents);
        setRequiredKeys(resp.required_documents);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/eventy/${wsSlug}/${eventSlug}/dokumenty`);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          router.replace(`/admin/eventy/${wsSlug}/${eventSlug}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wsSlug, eventSlug, router]);

  async function handleVerify(doc: EventDocument) {
    if (busy) return;
    const ok = await confirmDialog({
      title: "Schválit tento dokument?",
      description:
        "Účastníkovi to nikam neoznámíme — zelený stav je interní pro tvůj přehled. Schválení můžeš kdykoli zrušit.",
      confirmLabel: "Schválit",
    });
    if (!ok) return;
    setBusy(doc.id);
    try {
      const updated = await events.verifyDocument(wsSlug, eventSlug, doc.id);
      setDocs((prev) =>
        prev ? prev.map((d) => (d.id === doc.id ? updated : d)) : prev,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Akce selhala.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnverify(doc: EventDocument) {
    if (busy) return;
    const ok = await confirmDialog({
      title: "Zrušit schválení?",
      description: 'Vrátíme dokument do stavu „čeká na review".',
      confirmLabel: "Zrušit schválení",
    });
    if (!ok) return;
    setBusy(doc.id);
    try {
      const updated = await events.unverifyDocument(wsSlug, eventSlug, doc.id);
      setDocs((prev) =>
        prev ? prev.map((d) => (d.id === doc.id ? updated : d)) : prev,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Akce selhala.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rejectingDoc) return;
    const form = e.currentTarget as HTMLFormElement;
    const reason = ((form.elements.namedItem("reason") as HTMLTextAreaElement)?.value || "").trim();
    if (!reason) {
      setError("Vyplň důvod, ať účastník ví, co je špatně.");
      return;
    }
    setBusy(rejectingDoc.id);
    try {
      const updated = await events.rejectDocument(
        wsSlug,
        eventSlug,
        rejectingDoc.id,
        reason,
      );
      setDocs((prev) =>
        prev ? prev.map((d) => (d.id === rejectingDoc.id ? updated : d)) : prev,
      );
      setRejectingDoc(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Akce selhala.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error && !docs) return <Alert variant="danger">{error}</Alert>;
  if (!docs) return null;

  const filteredDocs =
    filter === "all" ? docs : docs.filter((d) => d.status === filter);

  const counts = {
    all: docs.length,
    pending: docs.filter((d) => d.status === "pending").length,
    verified: docs.filter((d) => d.status === "verified").length,
    rejected: docs.filter((d) => d.status === "rejected").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Akce", href: "/admin/eventy" },
          {
            label: "Detail akce",
            href: `/admin/eventy/${wsSlug}/${eventSlug}`,
          },
          { label: "Dokumenty" },
        ]}
      />

      <header>
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Dokumenty účastníků
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Tady vidíš všechny dokumenty, které účastníci nahráli k této
          akci. Schválené dokumenty zůstanou v zeleném stavu; zamítnutí
          dokumentu pošle účastníkovi e-mail s tvým důvodem a může
          nahrát opravu.
        </p>
      </header>

      {requiredKeys.length === 0 && (
        <Alert variant="info">
          U této akce zatím nemáš nastavené žádné požadované dokumenty.
          Otevři{" "}
          <Link
            href={`/admin/eventy/${wsSlug}/${eventSlug}/edit`}
            className="font-medium underline hover:text-ink-900"
          >
            Upravit detaily
          </Link>{" "}
          a v sekci „Požadované dokumenty" definuj, co účastníci mají
          nahrát.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterTab
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="Vše"
          count={counts.all}
        />
        <FilterTab
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          label="Čekají"
          count={counts.pending}
        />
        <FilterTab
          active={filter === "verified"}
          onClick={() => setFilter("verified")}
          label="Schváleno"
          count={counts.verified}
        />
        <FilterTab
          active={filter === "rejected"}
          onClick={() => setFilter("rejected")}
          label="Zamítnuto"
          count={counts.rejected}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {filteredDocs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-12 text-center">
          <p className="text-base font-semibold text-ink-900">
            {filter === "all"
              ? "Účastníci zatím nenahráli žádné dokumenty."
              : "V tomto stavu nic není."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Účastník</th>
                <th className="px-4 py-3">Dokument</th>
                <th className="px-4 py-3">Nahráno</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-2 py-3" aria-label="Akce" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-brand/5">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink-900">
                        {doc.user_full_name || doc.user_email}
                      </span>
                      <span className="text-xs text-ink-500">
                        {doc.user_email}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-ink-700 underline hover:text-ink-900"
                      >
                        {doc.original_name || doc.label || doc.key}
                      </a>
                      {doc.label && doc.original_name && (
                        <span className="text-xs text-ink-500">
                          {doc.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {new Date(doc.uploaded_at).toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status]}`}
                    >
                      {STATUS_LABEL[doc.status]}
                    </span>
                    {doc.status === "rejected" && doc.reject_reason && (
                      <p className="mt-1 max-w-xs text-xs text-ink-500">
                        Důvod: {doc.reject_reason}
                      </p>
                    )}
                    {doc.status === "verified" && doc.verified_by_name && (
                      <p className="mt-1 text-xs text-ink-500">
                        Schválil {doc.verified_by_name}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {doc.status !== "verified" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          disabled={busy === doc.id}
                          onClick={() => handleVerify(doc)}
                        >
                          ✓ Schválit
                        </Button>
                      )}
                      {doc.status === "verified" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="md"
                          disabled={busy === doc.id}
                          onClick={() => handleUnverify(doc)}
                        >
                          Zrušit schválení
                        </Button>
                      )}
                      {doc.status !== "rejected" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="md"
                          disabled={busy === doc.id}
                          onClick={() => setRejectingDoc(doc)}
                        >
                          ✗ Zamítnout
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectingDoc && (
        <RejectDialog
          doc={rejectingDoc}
          busy={busy === rejectingDoc.id}
          onCancel={() => setRejectingDoc(null)}
          onSubmit={handleRejectSubmit}
        />
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
        active
          ? "bg-brand text-brand-ink"
          : "bg-surface text-ink-700 hover:bg-surface-muted",
      ].join(" ")}
    >
      {label}{" "}
      <span
        className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono ${active ? "bg-brand-ink/10 text-brand-ink" : "bg-surface-muted text-ink-500"}`}
      >
        {count}
      </span>
    </button>
  );
}

function RejectDialog({
  doc,
  busy,
  onCancel,
  onSubmit,
}: {
  doc: EventDocument;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl"
      >
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            Zamítnout dokument
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Důvod posíláme účastníkovi e-mailem — pomůže mu pochopit, co
            je špatně, a nahrát opravu. Buď konkrétní.
          </p>
        </div>
        <p className="text-sm text-ink-700">
          <strong>{doc.user_full_name || doc.user_email}</strong> · {doc.label || doc.key}
        </p>
        <Field label="Důvod zamítnutí" htmlFor="reason">
          <textarea
            id="reason"
            name="reason"
            required
            rows={4}
            maxLength={500}
            placeholder="Např. Sken je špatně čitelný, není vidět razítko pojišťovny."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
          />
        </Field>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={busy}
          >
            Zrušit
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="md"
            loading={busy}
          >
            {busy ? "Odesílám…" : "Zamítnout + poslat e-mail"}
          </Button>
        </div>
      </form>
    </div>
  );
}
