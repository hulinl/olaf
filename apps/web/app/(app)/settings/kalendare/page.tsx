"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  personalCalendar,
  type CalendarSource,
} from "@/lib/api";

const COLOR_PALETTE = [
  "#0284c7",
  "#7c3aed",
  "#dc2626",
  "#16a34a",
  "#f97316",
  "#0f172a",
  "#64748b",
];

/**
 * Personal calendar sources page — Slice 5 vize „Časová osa" canvas.
 *
 * User si připojí libovolný počet iCal URL feedů (Google, Outlook,
 * Apple). Backend fetchne busy blocky a canvas view (`/kalendar`)
 * overlaeuje osobní obsazenost nad race kalendářem.
 *
 * Privacy: obsah eventů (summary, location, description) se **nikam
 * neposílá**. Serializeru z backendu jde jen počet bloků + last_synced_at.
 */
export default function KalendarePage() {
  const confirm = useConfirm();
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ical_url: "",
    color: COLOR_PALETTE[0],
  });
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setError(null);
    try {
      const r = await personalCalendar.listSources();
      setSources(r.sources);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Načtení selhalo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleAdd = async () => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await personalCalendar.addSource(form);
      setFlash("Kalendář přidán a synchronizován.");
      setForm({ name: "", ical_url: "", color: COLOR_PALETTE[0] });
      setAdding(false);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Přidání selhalo.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (source: CalendarSource) => {
    const ok = await confirm({
      title: `Smazat kalendář „${source.name}"?`,
      description:
        "Busy blocky z tohoto zdroje zmizí z canvasu. Můžeš ho kdykoliv znovu přidat.",
      variant: "danger",
      confirmLabel: "Smazat",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await personalCalendar.deleteSource(source.id);
      setFlash("Kalendář smazán.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Smazání selhalo.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (source: CalendarSource) => {
    setBusy(true);
    try {
      await personalCalendar.updateSource(source.id, {
        enabled: !source.enabled,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update selhal.");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async (source: CalendarSource) => {
    setBusy(true);
    setFlash(null);
    try {
      const r = await personalCalendar.syncSource(source.id);
      setFlash(
        r.sync_ok
          ? `Synchronizováno — ${r.block_count} bloků.`
          : `Chyba syncu: ${r.sync_message}`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sync selhal.");
    } finally {
      setBusy(false);
    }
  };

  const handleChangeColor = async (source: CalendarSource, color: string) => {
    setBusy(true);
    try {
      await personalCalendar.updateSource(source.id, { color });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update selhal.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-500">Načítám…</p>;
  }

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-ink-900">
          Osobní kalendáře
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Přidej si iCal URL feed svého kalendáře (Google, Outlook, Apple,
          Fastmail…) a osobní obsazenost se překryje nad race kalendářem
          v „Časové ose". Ukládá se jen anonymní start/end bloků — žádný
          obsah eventů se nikam neposílá.
        </p>
      </header>

      {flash && (
        <div className="mb-4">
          <Alert variant="success">{flash}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      <Card>
        <CardSection>
          {sources.length === 0 ? (
            <p className="text-sm text-ink-500">
              Zatím žádné připojené kalendáře.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: source.color }}
                      />
                      <span className="font-medium text-ink-900">
                        {source.name}
                      </span>
                      {!source.enabled && (
                        <span className="inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                          Vypnuto
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-full truncate text-xs text-ink-500">
                      {source.ical_url}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {source.last_synced_at
                        ? `Aktualizováno ${new Date(source.last_synced_at).toLocaleString("cs-CZ")} · ${source.block_count} bloků`
                        : "Ještě nesynchronizováno"}
                    </p>
                    {source.last_error && (
                      <p className="mt-1 text-xs text-danger">
                        Chyba: {source.last_error}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {COLOR_PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Barva ${c}`}
                          onClick={() => handleChangeColor(source, c)}
                          disabled={busy}
                          className={`h-5 w-5 rounded-full border ${source.color === c ? "border-ink-900" : "border-border"}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleSync(source)}
                      disabled={busy}
                    >
                      Sync teď
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleToggle(source)}
                      disabled={busy}
                    >
                      {source.enabled ? "Vypnout" : "Zapnout"}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(source)}
                      disabled={busy}
                    >
                      Smazat
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </Card>

      <div className="mt-4">
        {adding ? (
          <Card>
            <CardSection>
              <h3 className="text-base font-semibold text-ink-900">
                Přidat kalendář
              </h3>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm text-ink-700">
                  Název
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder='Např. „Pracovní Google"'
                    className="rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
                  />
                </label>
                <label className="grid gap-1 text-sm text-ink-700">
                  iCal URL
                  <input
                    type="url"
                    value={form.ical_url}
                    onChange={(e) =>
                      setForm({ ...form, ical_url: e.target.value })
                    }
                    placeholder="https://calendar.google.com/calendar/ical/..."
                    className="rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
                  />
                  <span className="text-xs text-ink-500">
                    Google:{" "}
                    <em>
                      Nastavení kalendáře → Sdílet → Tajná adresa v
                      formátu iCal
                    </em>
                    <br />
                    Outlook: <em>Sdílet → Zveřejnit kalendář → iCal</em>
                  </span>
                </label>
                <div className="flex gap-1">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Barva ${c}`}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`h-6 w-6 rounded-full border-2 ${form.color === c ? "border-ink-900" : "border-border"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAdd}
                    disabled={busy || !form.name || !form.ical_url}
                  >
                    Přidat + synchronizovat
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAdding(false);
                      setForm({
                        name: "",
                        ical_url: "",
                        color: COLOR_PALETTE[0],
                      });
                    }}
                    disabled={busy}
                  >
                    Zrušit
                  </Button>
                </div>
              </div>
            </CardSection>
          </Card>
        ) : (
          <Button onClick={() => setAdding(true)}>+ Přidat kalendář</Button>
        )}
      </div>
    </div>
  );
}
