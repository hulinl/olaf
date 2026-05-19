"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type User, auth } from "@/lib/api";

type NotifyPrefs = Pick<
  User,
  "notify_on_discussion_reply" | "notify_on_discussion_announce"
>;

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auth
      .me()
      .then((u) =>
        setPrefs({
          notify_on_discussion_reply: u.notify_on_discussion_reply,
          notify_on_discussion_announce: u.notify_on_discussion_announce,
        }),
      )
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Načtení selhalo."),
      );
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await auth.updateMe(prefs);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  function toggle<K extends keyof NotifyPrefs>(key: K) {
    setPrefs((p) => (p ? { ...p, [key]: !p[key] } : p));
  }

  if (!prefs) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Notifikace</h2>
          <p className="mt-1 text-sm text-ink-500">
            Transakční e-maily (potvrzení registrace, pokyny k platbě)
            chodí vždy. Tady spravuješ co ti chodí ze záležitostí komunit
            a akcí.
          </p>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h3 className="text-base font-semibold text-ink-900">Nástěnka</h3>
          <p className="mt-1 text-sm text-ink-500">
            E-maily o tématech a komentářích v komunitách a na akcích.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <ToggleRow
              label="Upozorňovat na odpovědi v mých tématech"
              hint="Když ti někdo odpoví na téma, které jsi založil/a."
              checked={prefs.notify_on_discussion_reply}
              onChange={() => toggle("notify_on_discussion_reply")}
            />
            <ToggleRow
              label="Upozorňovat na nová témata v komunitách a akcích"
              hint="Když owner nebo jiný člen otevře nové téma v komunitě, kde jsi člen, nebo na akci, kam jsi přihlášen/a."
              checked={prefs.notify_on_discussion_announce}
              onChange={() => toggle("notify_on_discussion_announce")}
            />
          </div>
        </CardSection>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}
      {saved && !error && (
        <Alert variant="success">Předvolby uloženy.</Alert>
      )}

      <div>
        <Button type="submit" variant="primary" size="md" loading={saving}>
          {saving ? "Ukládám…" : "Uložit"}
        </Button>
      </div>
    </form>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[input:checked]:border-brand">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 accent-brand"
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        {hint && <span className="mt-0.5 text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}
