"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  auth,
  workspaces,
  type Workspace,
  type WorkspaceHierarchy,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Nested community hierarchy management — Slice 4 vize.
 *
 * Admin komunity nastaví parent (umbrella) nebo schválí requesty
 * lokálních komunit, které se chtějí připojit pod tuhle. Effect:
 * - Aktivní parent link → členové této komunity jsou effective members
 *   parent, race calendar + akce se propagují dolů.
 * - Přijetí child → člun child community má stejné privileges skrz
 *   parent umbrella awareness.
 *
 * Vlastní setup / approval / reject je jen server-side + audit; tady je
 * jen UI, které volá API `/api/workspaces/<slug>/parent/` + endpointy
 * `/children/<child>/approve|reject/`.
 */
export default function HierarchyPage({ params }: Props) {
  const { slug } = use(params);
  const confirm = useConfirm();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [hierarchy, setHierarchy] = useState<WorkspaceHierarchy | null>(null);
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[]>([]);
  const [selectedParent, setSelectedParent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const [ws, h, mine] = await Promise.all([
        workspaces.detail(slug),
        workspaces.hierarchy(slug),
        workspaces.mine(),
      ]);
      setWorkspace(ws);
      setHierarchy(h);
      setMyWorkspaces(mine);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError(
          "Na tuto stránku má přístup jen owner nebo admin komunity.",
        );
      } else if (e instanceof ApiError && e.status === 401) {
        window.location.href = `/login?next=/tvurce/komunity/${slug}/hierarchie`;
      } else {
        setError(
          e instanceof ApiError
            ? e.message
            : "Načtení hierarchie selhalo.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void auth.me().catch(() => {
      window.location.href = `/login?next=/tvurce/komunity/${slug}/hierarchie`;
    });
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const runAction = async (
    action: () => Promise<unknown>,
    successMsg: string,
  ) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await action();
      setFlash(successMsg);
      await refresh();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Akce selhala.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSetParent = async () => {
    if (!selectedParent) return;
    await runAction(
      () => workspaces.setParent(slug, selectedParent),
      "Parent link vytvořen. Pokud jsi admin obou, je hned aktivní; jinak čeká na schválení parent adminem.",
    );
    setSelectedParent("");
  };

  const handleUnlinkParent = async () => {
    const ok = await confirm({
      title: "Odpojit parent umbrella?",
      description:
        "Členové této komunity přestanou být effective members parent komunity a propagace se vypne.",
      variant: "danger",
      confirmLabel: "Odpojit",
    });
    if (!ok) return;
    await runAction(
      () => workspaces.unlinkParent(slug),
      "Parent odpojen.",
    );
  };

  const handleApproveChild = async (childSlug: string) => {
    await runAction(
      () => workspaces.approveChild(slug, childSlug),
      "Child komunita schválena — propagace zapnuta.",
    );
  };

  const handleRejectChild = async (childSlug: string, childName: string) => {
    const ok = await confirm({
      title: `Zamítnout „${childName}"?`,
      description:
        "Link se smaže. Child admin může poslat request znovu později.",
      variant: "danger",
      confirmLabel: "Zamítnout",
    });
    if (!ok) return;
    await runAction(
      () => workspaces.rejectChild(slug, childSlug),
      "Request zamítnut.",
    );
  };

  // Filter picker: nabídneme jen workspaces, kde je user admin/owner a
  // které nejsou aktuální komunita ani ta, co má aktuální komunita jako
  // parent (backend to sice odchytne 400 na cycle, ale UX je lepší
  // preemptivně schovat.)
  const parentPickerOptions = myWorkspaces.filter(
    (w) =>
      w.slug !== slug &&
      (w.my_role === "owner" || w.my_role === "admin") &&
      w.slug !== hierarchy?.parent?.slug,
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-ink-500">Načítám hierarchii…</p>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }

  if (!workspace || !hierarchy) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumbs
        items={[
          { href: "/tvurce/komunity", label: "Komunity" },
          {
            href: `/tvurce/komunity/${slug}`,
            label: workspace.name,
          },
          { label: "Hierarchie" },
        ]}
      />

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold text-ink-900">
          Hierarchie komunity
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Propojte tuto komunitu s nadřazenou „umbrella" komunitou.
          Když je link aktivní, členové této komunity se automaticky
          zobrazují jako effective members v parent — pro race calendar
          i pro viditelnost akcí. Propagace jde <strong>oběma směry</strong>
          (parent vidí child members, child vidí parent akce).
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

      {/* --- PARENT SECTION --- */}
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Parent (nadřazená komunita)
          </h2>
          {hierarchy.parent ? (
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-ink-500">
                  Tato komunita je propojena pod:
                </p>
                <p className="mt-1 text-base font-medium text-ink-900">
                  <Link
                    href={`/tvurce/komunity/${hierarchy.parent.slug}`}
                    className="hover:text-brand"
                  >
                    {hierarchy.parent.name}
                  </Link>
                  <span
                    className={`ml-2 inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${
                      hierarchy.parent.link_status === "active"
                        ? "bg-success/15 text-success"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {hierarchy.parent.link_status === "active"
                      ? "Aktivní"
                      : "Čeká na schválení"}
                  </span>
                </p>
                {hierarchy.parent.link_status === "pending" && (
                  <p className="mt-2 text-xs text-ink-500">
                    Parent admin musí request schválit, aby se propagace
                    zapnula.
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                onClick={handleUnlinkParent}
                disabled={busy}
              >
                Odpojit
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-ink-500">
                Tato komunita zatím nemá žádného parenta. Vyberte jinou
                svoji komunitu, pod kterou se má tato zařadit.
              </p>
              {parentPickerOptions.length === 0 ? (
                <p className="mt-3 text-sm italic text-ink-500">
                  Nemáš žádnou další komunitu, kde bys byl(a) admin. Nejdřív
                  si založ druhou komunitu (nebo požádej admina cílové
                  komunity, ať ji ručně propojí přes Django admin).
                </p>
              ) : (
                <div className="mt-3 flex items-center gap-3">
                  <select
                    value={selectedParent}
                    onChange={(e) => setSelectedParent(e.target.value)}
                    disabled={busy}
                    className="flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
                  >
                    <option value="">— vyber parent komunitu —</option>
                    {parentPickerOptions.map((w) => (
                      <option key={w.slug} value={w.slug}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={handleSetParent}
                    disabled={!selectedParent || busy}
                  >
                    Propojit
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardSection>
      </Card>

      {/* --- CHILDREN SECTION --- */}
      <Card className="mt-4">
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">
            Podřazené komunity
          </h2>
          {hierarchy.children.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">
              Zatím žádné jiné komunity se nepřipojily pod tuto komunitu.
              Když admin jiné komunity požádá o propojení, uvidíš jeho
              request tady.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {hierarchy.children.map((child) => (
                <li
                  key={child.slug}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">
                      <Link
                        href={`/tvurce/komunity/${child.slug}`}
                        className="hover:text-brand"
                      >
                        {child.name}
                      </Link>
                      <span
                        className={`ml-2 inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${
                          child.link_status === "active"
                            ? "bg-success/15 text-success"
                            : "bg-warning/15 text-warning"
                        }`}
                      >
                        {child.link_status === "active"
                          ? "Aktivní"
                          : "Čeká na schválení"}
                      </span>
                    </p>
                    {child.requested_at && (
                      <p className="mt-1 text-xs text-ink-500">
                        Požádáno{" "}
                        {new Date(child.requested_at).toLocaleDateString(
                          "cs-CZ",
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {child.link_status === "pending" && (
                      <>
                        <Button
                          onClick={() => handleApproveChild(child.slug)}
                          disabled={busy}
                        >
                          Schválit
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() =>
                            handleRejectChild(child.slug, child.name)
                          }
                          disabled={busy}
                        >
                          Zamítnout
                        </Button>
                      </>
                    )}
                    {child.link_status === "active" && (
                      <Button
                        variant="danger"
                        onClick={() =>
                          handleRejectChild(child.slug, child.name)
                        }
                        disabled={busy}
                      >
                        Odpojit
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </Card>

      <div className="mt-6 rounded-md border border-border bg-surface-muted/40 p-4">
        <p className="mono-tag text-ink-500">Jak to funguje</p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink-700">
          <li>
            • <strong>Propagace nahoru:</strong> členové child komunity
            jsou v race kalendáři automaticky effective members parent.
          </li>
          <li>
            • <strong>Propagace dolů:</strong> akce publikované v parent
            se zobrazí i v listu child komunity.
          </li>
          <li>
            • <strong>Jen s active linkem</strong> — pending link
            (čekající na schválení) propagaci neaktivuje.
          </li>
          <li>
            • <strong>Když jsi admin obou stran:</strong> propojení
            proběhne okamžitě. Jinak musí admin cílové (parent) komunity
            schválit.
          </li>
        </ul>
      </div>
    </div>
  );
}
