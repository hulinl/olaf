"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type ChecklistItemRow,
  events,
} from "@/lib/api";

/**
 * „Mé úkoly" dashboard v Tvůrce shell.
 *
 * Dvě sekce:
 *  - Přiřazené mně — úkoly, kde jsem assignee (napříč všemi akcemi).
 *    Deadline nejbližší nahoře.
 *  - Na mých akcích — úkoly z akcí, kde jsem owner/co-creator,
 *    přiřazené někomu jinému (přehled, co ostatní řeší).
 *
 * Klik na řádek → cockpit akce, sekce Roadmap.
 */
export default function MyTasksPage() {
  const router = useRouter();
  const [assigned, setAssigned] = useState<ChecklistItemRow[] | null>(null);
  const [onMine, setOnMine] = useState<ChecklistItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await events.myTasks();
        if (cancelled) return;
        setAssigned(r.assigned_to_me);
        setOnMine(r.on_events_i_manage);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/ukoly");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (assigned === null || onMine === null) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          Mé úkoly
        </h1>
        <p className="text-sm text-ink-500">
          Přehled toho, co je na tobě, a co jsi zadal ostatním. Klik na
          úkol otevře cockpit akce.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">
          Přiřazené mně{" "}
          <span className="text-sm font-normal text-ink-500">
            ({assigned.length})
          </span>
        </h2>
        {assigned.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
            Nic tě nečeká. Když ti někdo (nebo ty sám sobě) přiřadí úkol,
            objeví se tady.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {assigned.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">
          Na mých akcích{" "}
          <span className="text-sm font-normal text-ink-500">
            ({onMine.length})
          </span>
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Úkoly přiřazené spolutvůrcům — pro tvůj přehled co běží.
        </p>
        {onMine.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
            Zatím jsi na akcích nikomu úkoly nezadal, nebo je všichni
            splnili.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {onMine.map((t) => (
              <TaskRow key={t.id} task={t} showAssignee />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TaskRow({
  task,
  showAssignee = false,
}: {
  task: ChecklistItemRow;
  showAssignee?: boolean;
}) {
  const cockpitUrl = `/admin/eventy/${task.workspace_slug}/${task.event_slug}`;
  const now = new Date();
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due !== null && due < now;
  const daysUntil = due
    ? Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <li>
      <Link
        href={cockpitUrl}
        className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:border-brand hover:bg-brand/5 focus-ring"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-ink-900">{task.title}</span>
            <span className="text-xs text-ink-500">· {task.event_title}</span>
          </div>
          {task.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">
              {task.description}
            </p>
          )}
        </div>
        {showAssignee && task.assignee_name && (
          <span
            className="rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
            title={task.assignee_email}
          >
            👤 {task.assignee_name}
          </span>
        )}
        {due && (
          <span
            className={[
              "whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium",
              overdue
                ? "bg-danger-soft text-danger"
                : daysUntil !== null && daysUntil <= 3
                  ? "bg-warning/15 text-warning"
                  : "bg-surface-muted text-ink-700",
            ].join(" ")}
          >
            {overdue
              ? `Po termínu ${Math.abs(daysUntil ?? 0)} d.`
              : daysUntil === 0
                ? "Dnes"
                : daysUntil === 1
                  ? "Zítra"
                  : `Za ${daysUntil} d.`}
          </span>
        )}
      </Link>
    </li>
  );
}
