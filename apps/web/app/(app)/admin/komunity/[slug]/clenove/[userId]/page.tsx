"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type WorkspaceMemberDetail,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; userId: string }>;
}

const RSVP_STATUS_LABEL: Record<string, string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítl",
  waitlist: "Waitlist",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

const RSVP_STATUS_TONE: Record<string, string> = {
  yes: "bg-success/15 text-success",
  waitlist: "bg-warning/15 text-warning",
  pending_approval: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  maybe: "bg-surface-muted text-ink-500",
  no: "bg-surface-muted text-ink-500",
};

export default function MemberDetailPage({ params }: Props) {
  const { slug, userId } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<WorkspaceMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .memberDetail(slug, Number(userId))
      .then((m) => {
        if (!cancelled) setMember(m);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/komunity/${slug}/clenove/${userId}`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/admin/komunity/${slug}/clenove`);
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
  }, [slug, userId, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!member) return null;

  const upcoming = member.rsvps.filter(
    (r) => new Date(r.event_starts_at).getTime() >= Date.now(),
  );
  const past = member.rsvps.filter(
    (r) => new Date(r.event_starts_at).getTime() < Date.now(),
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/komunity/${slug}/clenove`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na seznam členů
      </Link>

      <header>
        <p className="text-sm font-medium text-brand">Člen</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {member.full_name || member.email}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {member.email}
          {member.phone && ` · ${member.phone}`}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileFact label="Kondice" value={member.fitness_level || "—"} />
        <ProfileFact label="Strava" value={member.diet || "—"} />
        <ProfileFact label="Velikost trika" value={member.tshirt_size || "—"} />
        <ProfileFact
          label="Celkem akcí"
          value={String(member.rsvps.length)}
        />
      </div>

      {member.bio && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            O sobě
          </p>
          <p className="mt-2 text-sm text-ink-700">{member.bio}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink-900">
          Registrace ({member.rsvps.length})
        </h2>
        {member.rsvps.length === 0 ? (
          <p className="text-sm text-ink-500">Žádné registrace.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Akce</th>
                  <th className="px-4 py-3">Termín</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Platba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...upcoming, ...past].map((r) => (
                  <tr key={r.id} className="hover:bg-brand/10">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/eventy/${r.event_workspace_slug}/${r.event_slug}`}
                        className="font-medium text-ink-900 hover:underline"
                      >
                        {r.event_title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                      {new Date(r.event_starts_at).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={[
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          RSVP_STATUS_TONE[r.status] ?? "bg-surface-muted text-ink-500",
                        ].join(" ")}
                      >
                        {RSVP_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <PaymentBadge status={r.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
        Zaplaceno
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-warning/15 text-warning">
        Čeká
      </span>
    );
  }
  return <span className="text-ink-300">—</span>;
}
