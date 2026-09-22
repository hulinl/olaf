"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  type WorkspaceMemberRecord,
  workspaces as workspacesApi,
} from "@/lib/api";

interface Props {
  workspaceSlug: string;
  /** Notify parent so aktivní členové refresh po approve — jinak by
   *  se nový member neobjevil v CRM listu bez tvrdého reloadu. */
  onApproved?: () => void;
}

/**
 * Sekce "Žádosti o členství" pro workspace admin cockpit.
 *
 * Load pending members přes `/pending-members/`, každý řádek má
 * approve + reject akci. Prázdný stav se schová (aby v UI nezůstávala
 * mrtvá karta na workspace bez self-serve žadatelů).
 */
export function WorkspacePendingMembersSection({
  workspaceSlug,
  onApproved,
}: Props) {
  const [rows, setRows] = useState<WorkspaceMemberRecord[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await workspacesApi.pendingMembers(workspaceSlug);
      setRows(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Bez oprávnění tuto sekci vůbec neukážeme — parent by tuto
        // komponentu neměl mountovat, ale pojistka.
        setRows([]);
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Načtení žádostí selhalo.",
      );
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  async function handleApprove(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await workspacesApi.approveMember(workspaceSlug, id);
      await refresh();
      onApproved?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Schválení se nezdařilo.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: number) {
    setBusyId(id);
    setError(null);
    // Simple reason prompt — full modal by byl overkill pro admin cockpit.
    // Cancel z prompt = žádost nezamítáme.
    const reason = window.prompt(
      "Důvod zamítnutí (pošleme žadateli, můžeš nechat prázdné):",
      "",
    );
    if (reason === null) {
      setBusyId(null);
      return;
    }
    try {
      await workspacesApi.rejectMember(workspaceSlug, id, reason || undefined);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Zamítnutí se nezdařilo.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) {
    return null;
  }
  if (rows.length === 0) {
    // Prázdný stav — sekci vůbec nerenderujeme.
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-warning/40 bg-warning/5 p-5"
      aria-labelledby="pending-members-heading"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="pending-members-heading"
          className="text-base font-semibold text-ink-900"
        >
          Žádosti o členství{" "}
          <span className="ml-1 text-sm text-ink-500">({rows.length})</span>
        </h2>
        <p className="text-xs text-ink-500">
          Někdo požádal o vstup přes veřejnou stránku komunity. Schval nebo
          zamítni.
        </p>
      </div>
      {error && (
        <div className="mb-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((m) => {
          const name = [m.first_name, m.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">
                  {name || m.email || "(bez jména)"}
                </p>
                {m.email && (
                  <p className="truncate text-xs text-ink-500">{m.email}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => handleReject(m.id)}
                  disabled={busyId === m.id}
                >
                  Zamítnout
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => handleApprove(m.id)}
                  loading={busyId === m.id}
                >
                  Schválit
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
