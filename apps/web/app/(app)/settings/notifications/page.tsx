"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type User, auth } from "@/lib/api";
import {
  getExistingSubscription,
  isPwa,
  pushAvailable,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from "@/lib/push";

type NotifyPrefs = Pick<
  User,
  | "notify_on_discussion_reply"
  | "notify_on_discussion_announce"
  | "notify_on_discussion_mention"
  | "notify_on_event_update"
  | "notify_on_rsvp_status"
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
          notify_on_discussion_mention: u.notify_on_discussion_mention,
          notify_on_event_update: u.notify_on_event_update,
          notify_on_rsvp_status: u.notify_on_rsvp_status,
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
            E-mail + zvoneček o tématech a komentářích v komunitách a
            na akcích.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <ToggleRow
              label="Odpovědi v mých tématech"
              hint="Někdo odpovídá na téma, které jsi založil/a."
              checked={prefs.notify_on_discussion_reply}
              onChange={() => toggle("notify_on_discussion_reply")}
            />
            <ToggleRow
              label="Nová témata v komunitách a akcích"
              hint="Owner nebo jiný člen otevře nové téma v komunitě, kde jsi člen, nebo na akci, kam jsi přihlášen/a."
              checked={prefs.notify_on_discussion_announce}
              onChange={() => toggle("notify_on_discussion_announce")}
            />
            <ToggleRow
              label="@-zmínky v komentářích"
              hint="Někdo tě označí v komentáři přes @jmeno."
              checked={prefs.notify_on_discussion_mention}
              onChange={() => toggle("notify_on_discussion_mention")}
            />
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h3 className="text-base font-semibold text-ink-900">Akce</h3>
          <p className="mt-1 text-sm text-ink-500">
            Zvoneček (a e-mail) o tom, co se mění na akcích, kde jsi
            přihlášen/a.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <ToggleRow
              label="Změny v akci"
              hint="Pořadatel upravil termín, místo, cenu nebo kapacitu akce, na kterou jsi přihlášen/a."
              checked={prefs.notify_on_event_update}
              onChange={() => toggle("notify_on_event_update")}
            />
            <ToggleRow
              label="Status mé registrace"
              hint="Pořadatel schválil nebo zamítl tvou čekající přihlášku."
              checked={prefs.notify_on_rsvp_status}
              onChange={() => toggle("notify_on_rsvp_status")}
            />
          </div>
        </CardSection>
      </Card>

      <PushNotificationsCard />

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

function PushNotificationsCard() {
  const [supported] = useState(() => pushAvailable());
  const [pwa] = useState(() => isPwa());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!supported) return;
    getExistingSubscription().then((s) => setSubscribed(!!s));
  }, [supported]);

  if (!supported) {
    return (
      <Card>
        <CardSection>
          <h3 className="text-base font-semibold text-ink-900">
            Push notifikace
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Tento prohlížeč push notifikace nepodporuje, nebo nejsou v
            tomto prostředí nastavené.
          </p>
        </CardSection>
      </Card>
    );
  }

  async function handleSubscribe() {
    setBusy(true);
    setMsg(null);
    try {
      await subscribePush();
      setSubscribed(true);
      setMsg({ kind: "ok", text: "Push notifikace aktivované." });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Aktivace selhala.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function handleUnsubscribe() {
    setBusy(true);
    setMsg(null);
    try {
      await unsubscribePush();
      setSubscribed(false);
      setMsg({ kind: "ok", text: "Push notifikace vypnuté." });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Vypnutí selhalo.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function handleTest() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendTestPush();
      if (r.sent > 0) {
        setMsg({
          kind: "ok",
          text: `Testovací push odeslán na ${r.sent} zařízení. Mrkni do oznamovací lišty.`,
        });
      } else if (!r.vapid_configured) {
        setMsg({
          kind: "err",
          text:
            "Backend nemá nastavený VAPID — push v tomto prostředí nefunguje. Řekni adminovi.",
        });
      } else if (r.subscriptions === 0) {
        setMsg({
          kind: "err",
          text:
            "Tvoje zařízení není zaregistrované u backendu. Vypni push a aktivuj ho znovu — předchozí pokus se asi neuložil.",
        });
      } else {
        setMsg({
          kind: "err",
          text: `Push nedoručen — ${r.subscriptions} zařízení v DB ale push service je odmítla. Push subscriptions byly přemazány.`,
        });
      }
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Test selhal.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardSection>
        <h3 className="text-base font-semibold text-ink-900">
          Push notifikace
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Okamžitá upozornění v oznamovací liště telefonu nebo počítače
          — paralelně s e-maily. Na iPhonu fungují, jen pokud máš olaf
          přidaný na hlavní obrazovku přes Safari → Sdílet → Přidat na
          plochu.
        </p>
        {!pwa && (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-ink-700">
            Tip: na iOS aktivuj push až poté, co si appku přidáš na
            plochu (Safari → ikonka sdílení → „Přidat na plochu").
            V samotném prohlížeči iOS push neumí.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {subscribed === null ? (
            <span className="text-sm text-ink-500">Načítám…</span>
          ) : subscribed ? (
            <>
              <button
                type="button"
                onClick={handleUnsubscribe}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50 focus-ring"
              >
                Vypnout push
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={busy}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-50 focus-ring"
              >
                Pošli testovací push
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
            >
              Aktivovat push na tomto zařízení
            </button>
          )}
        </div>
        {msg && (
          <div className="mt-3">
            <Alert variant={msg.kind === "ok" ? "success" : "danger"}>
              {msg.text}
            </Alert>
          </div>
        )}
      </CardSection>
    </Card>
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
