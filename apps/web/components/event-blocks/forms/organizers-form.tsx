"use client";

import { useEffect, useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { type OrganizerPoolEntry, events } from "@/lib/api";
import type { OrganizersBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: OrganizersBlockPayload;
  onChange: (p: OrganizersBlockPayload) => void;
  workspaceSlug?: string;
  eventSlug?: string;
}

/**
 * Editor pro Organizers block. Owner zaklikne lidi z `organizer-pool/`
 * endpoint-u (= workspace owner/admins + EventCollaborators). Pořadí
 * `user_ids` v payloadu drží pořadí karet na public landing — toggle
 * checkboxu přidá user na konec, nezaškrtnutí ho odstraní.
 *
 * Položky bez bio + avataru se ukazují, ale s "doplň profil" hint-em —
 * jinak by se na landing zobrazila prázdná karta. User musí jít do
 * /settings/profile/ doplnit info a fotku.
 */
export function OrganizersForm({
  payload,
  onChange,
  workspaceSlug,
  eventSlug,
}: Props) {
  const [pool, setPool] = useState<OrganizerPoolEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceSlug || !eventSlug) {
      setPool([]);
      return;
    }
    events
      .listOrganizerPool(workspaceSlug, eventSlug)
      .then(setPool)
      .catch(() =>
        setError("Nepodařilo se načíst seznam možných organizátorů."),
      );
  }, [workspaceSlug, eventSlug]);

  const selected = new Set(payload.user_ids ?? []);

  function toggle(userId: number) {
    const next = (payload.user_ids ?? []).slice();
    const idx = next.indexOf(userId);
    if (idx >= 0) {
      next.splice(idx, 1);
    } else {
      next.push(userId);
    }
    onChange({ ...payload, user_ids: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) =>
              onChange({ ...payload, eyebrow: e.target.value })
            }
            placeholder="Tým"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.title ?? ""}
            onChange={(e) =>
              onChange({ ...payload, title: e.target.value })
            }
            placeholder="Kdo to vede"
          />
        </Field>
      </div>

      <Field
        label="Úvodní text"
        hint="Volitelně — jedna věta nad kartami."
      >
        <Input
          value={payload.intro ?? ""}
          onChange={(e) => onChange({ ...payload, intro: e.target.value })}
          placeholder="Tým, který stojí za touhle akcí."
        />
      </Field>

      <Field
        label="Vyber organizátory"
        hint={
          pool && pool.length === 0
            ? "Zatím nemáš žádné spolutvůrce. Přidej je v záložce Spolutvůrci."
            : "Zaškrtni lidi, kteří se mají objevit na public landing. Pořadí karet odpovídá pořadí výběru."
        }
      >
        {pool === null ? (
          <p className="rounded-md border border-border bg-surface-muted/30 px-3 py-2 text-sm text-ink-500">
            Načítám…
          </p>
        ) : pool.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-muted/30 px-3 py-2 text-sm text-ink-500">
            Žádní eligible organizátoři.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pool.map((u) => {
              const on = selected.has(u.user_id);
              const incomplete = !u.bio || !u.avatar_url;
              return (
                <li key={u.user_id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(u.user_id)}
                      className="mt-1 size-4 accent-brand"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-ink-900">
                          {u.display_name || u.full_name}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
                          {u.role === "owner"
                            ? "Zakladatel"
                            : u.role === "admin"
                              ? "Admin"
                              : "Spolutvůrce"}
                        </span>
                      </div>
                      {u.bio ? (
                        <p className="mt-1 line-clamp-2 text-xs text-ink-600">
                          {u.bio}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-ink-500">
                          Nemá vyplněné bio.
                        </p>
                      )}
                      {incomplete && on && (
                        <p className="mt-1 text-[11px] text-warning">
                          Doplň fotku a bio v Nastavení → Profil — jinak
                          bude karta na landing prázdná.
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Field>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
