"use client";

import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  type Community,
  type CommunityInviteResult,
  type CommunityMemberRecord,
  type Workspace,
  communities as communitiesApi,
  workspaces,
} from "@/lib/api";

const VISIBILITY_OPTIONS: {
  value: Community["visibility"];
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    label: "Veřejná",
    description:
      "Kdokoli si stránku otevře a může poslat žádost o vstup. Ty schvaluješ.",
  },
  {
    value: "unlisted",
    label: "Skrytá s odkazem",
    description:
      "Stránka je dostupná jen přes přímý odkaz. Nikdo se nepřidává sám.",
  },
  {
    value: "private",
    label: "Soukromá",
    description:
      "Vidí ji jen členové. Nové členy přidáváš ručně přes seznam níž.",
  },
];

interface Props {
  params: Promise<{ slug: string; communitySlug: string }>;
}

const STATUS_LABELS: Record<CommunityMemberRecord["status"], string> = {
  pending: "Čeká",
  member: "Člen",
  declined: "Odmítnuto",
  removed: "Odstraněn",
};

const STATUS_TONE: Record<CommunityMemberRecord["status"], string> = {
  pending: "bg-warning/15 text-warning",
  member: "bg-success/15 text-success",
  declined: "bg-surface-muted text-ink-500",
  removed: "bg-danger-soft text-danger",
};

const ROLE_LABELS: Record<CommunityMemberRecord["role"], string> = {
  admin: "Admin",
  member: "Člen",
};

// Admin badge se zobrazuje, jen když role=admin — běžný member nemá
// vizuální šum „member" vedle status badge. Status už říká „Člen".
const ROLE_BADGE_TONE = "bg-brand/15 text-brand";

export default function CommunityDetailPage({ params }: Props) {
  const { slug: wsSlug, communitySlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  const [inviteEmails, setInviteEmails] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<CommunityInviteResult | null>(
    null,
  );
  const [decidingMemberId, setDecidingMemberId] = useState<number | null>(null);

  // Settings karta má vlastní state, aby změny visibility/policy uživatel
  // uviděl okamžitě (bez čekání na refetch) a mohl klikat Uložit až když
  // je hotový. Souběžně synchronizujeme s `community` po fetch/save.
  const [settingsVisibility, setSettingsVisibility] = useState<
    Community["visibility"]
  >("private");
  const [settingsPolicy, setSettingsPolicy] =
    useState<Community["membership_policy"]>("approval");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, c, m] = await Promise.all([
          workspaces.detail(wsSlug),
          communitiesApi.detail(wsSlug, communitySlug),
          communitiesApi.members(wsSlug, communitySlug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/workspaces/${wsSlug}`);
          return;
        }
        setWorkspace(ws);
        setCommunity(c);
        setSettingsVisibility(c.visibility);
        setSettingsPolicy(c.membership_policy);
        setMembers(m);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/workspaces/${wsSlug}`);
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
  }, [wsSlug, communitySlug, router]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmails.trim()) return;
    setInviting(true);
    setError(null);
    setLastInvite(null);
    try {
      const result = await communitiesApi.invite(
        wsSlug,
        communitySlug,
        inviteEmails,
      );
      setLastInvite(result);
      setInviteEmails("");
      // Refresh full roster
      const m = await communitiesApi.members(wsSlug, communitySlug);
      setMembers(m);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Pozvánky se nepodařilo zpracovat.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: CommunityMemberRecord) {
    const ok = await confirmDialog({
      title: `Odstranit ${member.user_full_name} z komunity?`,
      description:
        "Jeho RSVPs zůstávají, nebude ale dostávat newsletter ani uvidí soukromé akce. Pozvat zpět můžeš kdykoli.",
      confirmLabel: "Odstranit",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await communitiesApi.removeMember(wsSlug, communitySlug, member.id);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, status: "removed" } : m,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Odstranění selhalo.");
    }
  }

  async function handleRoleChange(member: CommunityMemberRecord) {
    const promoting = member.role === "member";
    const ok = await confirmDialog({
      title: promoting
        ? `Povýšit ${member.user_full_name} na admina?`
        : `Snížit ${member.user_full_name} z admina?`,
      description: promoting
        ? "Admin uvidí všechny akce, může spravovat členy a editovat komunitní obsah."
        : "Ztratí přístup ke správě členů i editaci komunitního obsahu. Zůstává jako běžný člen.",
      confirmLabel: promoting ? "Povýšit" : "Snížit",
      variant: promoting ? "primary" : "danger",
    });
    if (!ok) return;
    try {
      const updated = await communitiesApi.setMemberRole(
        wsSlug,
        communitySlug,
        member.id,
        promoting ? "admin" : "member",
      );
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: updated.role } : m)),
      );
      setError(null);
    } catch (err) {
      // Server vrací 403 s `detail` (Czech) pro last-admin guard atd.
      // ApiError.message už obsahuje data.detail když je string (viz
      // ApiError konstruktor). Stačí předat err.message.
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Změna role selhala.");
      }
    }
  }

  async function handleApprove(member: CommunityMemberRecord) {
    setDecidingMemberId(member.id);
    setError(null);
    try {
      const updated = await communitiesApi.approveMember(
        wsSlug,
        communitySlug,
        member.id,
      );
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)),
      );
      // member_count je server-computed, refetch komunity aby se badge
      // v hlavičce srovnal.
      try {
        const c = await communitiesApi.detail(wsSlug, communitySlug);
        setCommunity(c);
      } catch {
        // Když refetch spadne, drží se stará hodnota — schvalování
        // samotné už proběhlo úspěšně a member v listu už je "member".
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Schválení selhalo.");
    } finally {
      setDecidingMemberId(null);
    }
  }

  async function handleReject(member: CommunityMemberRecord) {
    const ok = await confirmDialog({
      title: `Zamítnout žádost ${member.user_full_name}?`,
      description:
        "Uživatel dostane oznámení. O vstup může požádat znovu, dokud komunita zůstává veřejná.",
      confirmLabel: "Zamítnout",
      variant: "danger",
    });
    if (!ok) return;
    setDecidingMemberId(member.id);
    setError(null);
    try {
      const updated = await communitiesApi.rejectMember(
        wsSlug,
        communitySlug,
        member.id,
      );
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zamítnutí selhalo.");
    } finally {
      setDecidingMemberId(null);
    }
  }

  async function handleSaveSettings() {
    if (!community) return;
    setSavingSettings(true);
    setSettingsSaved(false);
    setError(null);
    try {
      const updated = await communitiesApi.update(wsSlug, communitySlug, {
        visibility: settingsVisibility,
        membership_policy: settingsPolicy,
      });
      setCommunity(updated);
      setSettingsSaved(true);
      // Auto-hide "Uloženo" hlášky po pár vteřinách, ať se nehromadí.
      window.setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Uložení nastavení selhalo.",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }
  if (!workspace || !community) return null;

  const pendingRequests = members.filter((m) => m.status === "pending");
  const activeMembers = members.filter((m) => m.status === "member");
  const settingsDirty =
    settingsVisibility !== community.visibility ||
    settingsPolicy !== community.membership_policy;

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Komunity", href: "/workspaces" },
            { label: workspace.name, href: `/workspaces/${wsSlug}` },
            { label: community.name },
          ]}
        />

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            {community.name}
          </h1>
          {community.description && (
            <p className="mt-2 max-w-2xl text-ink-700">
              {community.description}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-500">
            {community.member_count} členů ·{" "}
            {community.visibility === "public"
              ? "Veřejná"
              : community.visibility === "unlisted"
                ? "Skrytá (jen odkaz)"
                : "Soukromá"}
          </p>
        </header>

        {error && (
          <div className="mb-6">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <Card className="mb-6 border-warning/40">
            <CardSection>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-ink-900">
                  Žádosti o členství
                </h2>
                <span className="rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  {pendingRequests.length} čeká
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-500">
                Uživatelé, kteří kliknuli na „Přidat se ke komunitě" na
                veřejné stránce. Uprav nastavení komunity níž, pokud toto
                CTA na veřejné stránce nechceš.
              </p>
              <ul className="mt-4 divide-y divide-border">
                {pendingRequests.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">
                        {m.user_full_name}
                      </p>
                      <p className="truncate text-sm text-ink-500">
                        {m.user_email}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={() => handleApprove(m)}
                        loading={decidingMemberId === m.id}
                      >
                        Schválit
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={() => handleReject(m)}
                        disabled={decidingMemberId === m.id}
                      >
                        Zamítnout
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardSection>
          </Card>
        )}

        <Card>
          <CardSection>
            <h2 className="text-base font-semibold text-ink-900">
              Přidat členy
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Vlož emaily oddělené novými řádky nebo čárkou. Účet už musí
              existovat (pozvánky pro nové uživatele jsou ve V1.5).
            </p>
            <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3">
              <textarea
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                rows={4}
                placeholder={"hulin@example.com\njana@example.com"}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={inviting}
                >
                  Přidat
                </Button>
              </div>
            </form>
            {lastInvite && (
              <div className="mt-4 space-y-2 text-sm">
                {lastInvite.added.length > 0 && (
                  <p className="text-success">
                    Přidáno: {lastInvite.added.length}
                  </p>
                )}
                {lastInvite.skipped_already_member.length > 0 && (
                  <p className="text-ink-500">
                    Už členy:{" "}
                    {lastInvite.skipped_already_member.join(", ")}
                  </p>
                )}
                {lastInvite.no_account_yet.length > 0 && (
                  <p className="text-warning">
                    Bez účtu (V1.5): {lastInvite.no_account_yet.join(", ")}
                  </p>
                )}
              </div>
            )}
          </CardSection>
        </Card>

        <h2 className="mt-10 text-lg font-semibold text-ink-900">
          Členové ({activeMembers.length})
        </h2>
        {activeMembers.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
            Zatím žádní členové. Přidej někoho výše.
          </p>
        ) : (
          <Card className="mt-3">
            <ul className="divide-y divide-border">
              {activeMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">
                      {m.user_full_name}
                    </p>
                    <p className="truncate text-sm text-ink-500">
                      {m.user_email}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                      STATUS_TONE[m.status],
                    ].join(" ")}
                  >
                    {STATUS_LABELS[m.status]}
                  </span>
                  {m.role === "admin" && m.status === "member" && (
                    <span
                      className={[
                        "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                        ROLE_BADGE_TONE,
                      ].join(" ")}
                      title="Community admin — má oprávnění spravovat komunitu"
                    >
                      {ROLE_LABELS.admin}
                    </span>
                  )}
                  {m.status === "member" && (
                    <button
                      type="button"
                      onClick={() => handleRoleChange(m)}
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
                    >
                      {m.role === "admin" ? "Snížit na člena" : "Povýšit na admina"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted hover:text-danger focus-ring"
                  >
                    Odebrat
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <h2 className="mt-10 text-lg font-semibold text-ink-900">
          Nastavení komunity
        </h2>
        <Card className="mt-3">
          <CardSection>
            <div>
              <p className="text-sm font-medium text-ink-900">Viditelnost</p>
              <p className="mt-1 text-sm text-ink-500">
                Určuje, kdo si otevře veřejnou stránku a jestli se lidé mohou
                sami hlásit.
              </p>
              <fieldset className="mt-3 space-y-2">
                {VISIBILITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-md border p-3",
                      settingsVisibility === opt.value
                        ? "border-brand bg-brand/5"
                        : "border-border bg-surface hover:bg-surface-muted",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={opt.value}
                      checked={settingsVisibility === opt.value}
                      onChange={() => setSettingsVisibility(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-ink-900">
                        {opt.label}
                      </p>
                      <p className="text-sm text-ink-500">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </fieldset>
              {settingsVisibility === "public" && (
                <p className="mt-3 rounded-md bg-info/10 p-3 text-sm text-ink-700">
                  Veřejná adresa:{" "}
                  <a
                    href={`/${wsSlug}/k/${communitySlug}`}
                    className="font-mono text-brand underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    /{wsSlug}/k/{communitySlug}
                  </a>
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleSaveSettings}
                loading={savingSettings}
                disabled={!settingsDirty}
              >
                Uložit nastavení
              </Button>
              {settingsSaved && (
                <span className="text-sm text-success">Uloženo.</span>
              )}
            </div>
          </CardSection>
        </Card>
      </section>
    </main>
  );
}
