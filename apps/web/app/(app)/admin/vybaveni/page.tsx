"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type GearItem,
  type GearList,
  type GearListVisibility,
  type User,
  auth,
  gear,
} from "@/lib/api";

/**
 * /admin/vybaveni — user-scoped gear catalog + named lists.
 *
 * Two sections: Vybavení (items library) at top, Listy (assemblies)
 * below. Items can live in 0..N lists; lists are reusable across
 * trips. Each opened list gets a dashboard (total weight + by-category
 * breakdown). Public sharing via /gear/<slug>.
 */
export default function GearSettingsPage() {
  const [items, setItems] = useState<GearItem[] | null>(null);
  const [lists, setLists] = useState<GearList[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const [is, ls] = await Promise.all([gear.listItems(), gear.listLists()]);
      setItems(is);
      setLists(ls);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (!items || !lists) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Vybavení</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Tvůj gear
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Osobní katalog vybavení — z těchto položek skládáš listy pro
          konkrétní akce (např. „Beskická 7"). Každý list jde sdílet
          odkazem a v budoucnu připojit k eventu.
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      <ItemSection items={items} onChange={reload} />
      <ListSection lists={lists} items={items} onChange={reload} />
      <AffiliateSection />
    </div>
  );
}

function AffiliateSection() {
  const [partners, setPartners] = useState<
    { domain: string; params: Record<string, string> }[] | null
  >(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    auth.me().then((u: User) => setPartners(u.affiliate_partners ?? []));
  }, []);

  function update(
    next: { domain: string; params: Record<string, string> }[],
  ) {
    setPartners(next);
  }

  async function save() {
    if (partners == null) return;
    setBusy(true);
    setMsg(null);
    try {
      await auth.updateMe({ affiliate_partners: partners });
      setMsg("Uloženo.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardSection>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left focus-ring"
        >
          <div>
            <h3 className="text-base font-semibold text-ink-900">
              Affiliate partneři
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Když si někdo klikne přes tvůj gear na e-shop, můžeme k URL
              automaticky přidat tvůj affiliate identifikátor. Stačí
              přidat e-shop a páry klíč/hodnota.
            </p>
          </div>
          <span aria-hidden className={open ? "rotate-90 text-ink-500" : "text-ink-500"}>
            ›
          </span>
        </button>

        {open && partners && (
          <div className="mt-4 flex flex-col gap-3">
            {partners.length === 0 && (
              <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
                Zatím nemáš žádného partnera. Příklad: doména „alza.cz",
                klíč „ref", hodnota tvůj affiliate ID.
              </p>
            )}
            {partners.map((p, i) => (
              <PartnerRow
                key={i}
                partner={p}
                onChange={(next) => {
                  const copy = [...partners];
                  copy[i] = next;
                  update(copy);
                }}
                onDelete={() =>
                  update(partners.filter((_, j) => j !== i))
                }
              />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  update([...partners, { domain: "", params: {} }])
                }
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
              >
                + Přidat partnera
              </button>
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={busy}
                onClick={save}
              >
                {busy ? "Ukládám…" : "Uložit"}
              </Button>
              {msg && <span className="text-xs text-ink-500">{msg}</span>}
            </div>
          </div>
        )}
      </CardSection>
    </Card>
  );
}

function PartnerRow({
  partner,
  onChange,
  onDelete,
}: {
  partner: { domain: string; params: Record<string, string> };
  onChange: (next: { domain: string; params: Record<string, string> }) => void;
  onDelete: () => void;
}) {
  // Render params as a list of {key, value} pairs.
  const entries = Object.entries(partner.params);

  function setDomain(v: string) {
    onChange({ ...partner, domain: v });
  }
  function setParam(idx: number, key: string, value: string) {
    const copy = entries.slice();
    copy[idx] = [key, value];
    onChange({
      ...partner,
      params: Object.fromEntries(copy.filter(([k]) => k)),
    });
  }
  function addParam() {
    onChange({
      ...partner,
      params: { ...partner.params, "": "" },
    });
  }
  function removeParam(idx: number) {
    onChange({
      ...partner,
      params: Object.fromEntries(entries.filter((_, j) => j !== idx)),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <Field label="Doména e-shopu" htmlFor={`dom-${partner.domain}`}>
            <Input
              id={`dom-${partner.domain}`}
              value={partner.domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="alza.cz"
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-ink-500 hover:text-danger"
        >
          Smazat partnera
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Query parametry
        </p>
        {entries.length === 0 && (
          <p className="text-xs text-ink-500">
            Bez parametrů — žádný affiliate identifikátor se nepřidá.
          </p>
        )}
        {entries.map(([k, v], i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[120px]">
              <Input
                value={k}
                onChange={(e) => setParam(i, e.target.value, v)}
                placeholder="ref"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <Input
                value={v}
                onChange={(e) => setParam(i, k, e.target.value)}
                placeholder="moje-affiliate-id"
              />
            </div>
            <button
              type="button"
              onClick={() => removeParam(i)}
              className="text-xs text-ink-500 hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addParam}
          className="self-start text-xs font-medium text-brand hover:underline"
        >
          + Přidat parametr
        </button>
      </div>
    </div>
  );
}

function ItemSection({
  items,
  onChange,
}: {
  items: GearItem[];
  onChange: () => Promise<void>;
}) {
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-ink-900">
            Položky ({items.length})
          </h3>
          {!composerOpen && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setComposerOpen(true)}
            >
              + Přidat položku
            </Button>
          )}
        </div>

        {composerOpen && (
          <ItemEditor
            onCancel={() => setComposerOpen(false)}
            onSave={async (payload) => {
              await gear.createItem(payload);
              setComposerOpen(false);
              await onChange();
            }}
          />
        )}

        {items.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
            Žádné položky. Začni přidáním prvního kusu vybavení.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {items.map((i) => (
              <ItemRow key={i.id} item={i} onChange={onChange} />
            ))}
          </div>
        )}
      </CardSection>
    </Card>
  );
}

function ItemRow({
  item,
  onChange,
}: {
  item: GearItem;
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-md border border-border bg-surface-muted/30 p-3">
        <ItemEditor
          initial={item}
          onCancel={() => setEditing(false)}
          onSave={async (payload) => {
            await gear.updateItem(item.id, payload);
            setEditing(false);
            await onChange();
          }}
          onDelete={async () => {
            if (!confirm(`Smazat položku „${item.name}"?`)) return;
            await gear.deleteItem(item.id);
            setEditing(false);
            await onChange();
          }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex flex-col items-start gap-1 rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand/5 focus-ring sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="flex-1 font-medium text-ink-900">{item.name}</span>
      <span className="flex items-center gap-3 text-xs text-ink-500">
        {item.category && (
          <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {item.category}
          </span>
        )}
        {item.weight_g != null && (
          <span className="font-mono tabular-nums">
            {item.weight_g >= 1000
              ? `${(item.weight_g / 1000).toFixed(2)} kg`
              : `${item.weight_g} g`}
          </span>
        )}
        {item.url && <span className="text-brand">↗</span>}
      </span>
    </button>
  );
}

function ItemEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: GearItem;
  onSave: (payload: {
    name: string;
    weight_g: number | null;
    url: string;
    category: string;
    note: string;
  }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [weight, setWeight] = useState(
    initial?.weight_g != null ? String(initial.weight_g) : "",
  );
  const [url, setUrl] = useState(initial?.url ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const w = weight.trim();
      await onSave({
        name: name.trim(),
        weight_g: w ? Math.max(0, parseInt(w, 10) || 0) : null,
        url: url.trim(),
        category: category.trim(),
        note: note.trim(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handle}
      className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-surface-muted/30 p-3"
    >
      <Field label="Název *" htmlFor="gi-name">
        <Input
          id="gi-name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spacák Cumulus X100"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Váha v gramech" htmlFor="gi-weight">
          <Input
            id="gi-weight"
            inputMode="numeric"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="900"
          />
        </Field>
        <Field label="Kategorie" htmlFor="gi-cat" hint='např. „spaní", „vaření", „oblečení"'>
          <Input
            id="gi-cat"
            maxLength={60}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
      </div>
      <Field label="URL produktu (volitelné)" htmlFor="gi-url">
        <Input
          id="gi-url"
          type="url"
          maxLength={600}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://eshop.cz/..."
        />
      </Field>
      <Field label="Poznámka (volitelné)" htmlFor="gi-note">
        <Input
          id="gi-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="velikost L, modrá"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="md" loading={busy}>
          {busy ? "Ukládám…" : "Uložit"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          Zrušit
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-md border border-danger/40 bg-surface px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            Smazat
          </button>
        )}
      </div>
    </form>
  );
}

function ListSection({
  lists,
  items,
  onChange,
}: {
  lists: GearList[];
  items: GearItem[];
  onChange: () => Promise<void>;
}) {
  const [openListId, setOpenListId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const n = newListName.trim();
    if (!n) return;
    await gear.createList(n);
    setNewListName("");
    setComposerOpen(false);
    await onChange();
  }

  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-ink-900">
            Listy ({lists.length})
          </h3>
          {!composerOpen && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setComposerOpen(true)}
            >
              + Nový list
            </Button>
          )}
        </div>

        {composerOpen && (
          <form onSubmit={handleCreate} className="mt-4 flex flex-wrap gap-2">
            <Input
              required
              maxLength={200}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Beskická 7"
              className="flex-1 min-w-[200px]"
            />
            <Button type="submit" variant="primary" size="md">
              Vytvořit
            </Button>
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setNewListName("");
              }}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
            >
              Zrušit
            </button>
          </form>
        )}

        {lists.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
            Zatím žádný list. Vytvoř si první (např. „Beskická 7") a pak do
            něj přidej položky z katalogu.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {lists.map((l) => (
              <ListCard
                key={l.id}
                list={l}
                items={items}
                isOpen={openListId === l.id}
                onToggle={() =>
                  setOpenListId(openListId === l.id ? null : l.id)
                }
                onChange={onChange}
              />
            ))}
          </div>
        )}
      </CardSection>
    </Card>
  );
}

function ListCard({
  list,
  items,
  isOpen,
  onToggle,
  onChange,
}: {
  list: GearList;
  items: GearItem[];
  isOpen: boolean;
  onToggle: () => void;
  onChange: () => Promise<void>;
}) {
  const totalKg = list.total_weight_g / 1000;
  const usedItemIds = new Set(list.entries.map((e) => e.item.id));
  const availableItems = items.filter((i) => !usedItemIds.has(i.id));
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleDelete() {
    if (!confirm(`Smazat list „${list.name}"?`)) return;
    await gear.deleteList(list.id);
    await onChange();
  }

  return (
    <div className="rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-ring hover:bg-brand/5"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className={isOpen ? "rotate-90" : ""}>
            ›
          </span>
          <span className="font-medium text-ink-900">{list.name}</span>
        </div>
        <span className="text-xs text-ink-500">
          {list.item_count} ks ·{" "}
          {list.total_weight_g > 0
            ? `${totalKg.toFixed(2)} kg`
            : "bez váhy"}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 py-4">
          {list.entries.length > 0 && <ListDashboard list={list} />}
          <SharePanel list={list} onChange={onChange} />
          {list.entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
              List je prázdný. Přidej položky z katalogu.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {list.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-ink-900">
                      {e.item.name}
                    </span>
                    {e.item.category && (
                      <span className="text-[11px] text-ink-500">
                        {e.item.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {e.item.url && (e.click_count ?? 0) > 0 && (
                      <span
                        title="Počet prokliků na affiliate odkaz"
                        className="rounded bg-brand/10 px-1.5 py-0.5 font-mono tabular-nums text-brand"
                      >
                        {e.click_count}↗
                      </span>
                    )}
                    {e.item.weight_g != null && (
                      <span className="font-mono tabular-nums text-ink-700">
                        {e.quantity}× {e.item.weight_g} g
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await gear.removeListEntry(list.id, e.id);
                        await onChange();
                      }}
                      className="text-ink-500 hover:text-danger"
                    >
                      Odebrat
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {availableItems.length > 0 ? (
              !pickerOpen ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
                >
                  + Přidat položku
                </button>
              ) : (
                <ItemPicker
                  items={availableItems}
                  onPick={async (id) => {
                    await gear.addItemToList(list.id, id);
                    setPickerOpen(false);
                    await onChange();
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )
            ) : (
              <span className="text-xs text-ink-500">
                Všechny tvoje položky jsou už v tomto listu.
              </span>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto text-xs font-medium text-ink-500 hover:text-danger"
            >
              Smazat list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemPicker({
  items,
  onPick,
  onClose,
}: {
  items: GearItem[];
  onPick: (id: number) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-surface-muted/30 p-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-ink-700">Vyber položku</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Zavřít
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onPick(i.id)}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-xs hover:border-brand hover:bg-brand/5"
          >
            <span className="font-medium text-ink-900">{i.name}</span>
            {i.weight_g != null && (
              <span className="font-mono text-ink-500">{i.weight_g} g</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Inline dashboard for an opened gear list. Shows total weight + a
 *  per-category breakdown so the owner sees what's eating their
 *  pack-weight budget without leaving the page. No chart lib — bars
 *  are CSS-sized to keep the bundle tiny. */
function ListDashboard({ list }: { list: GearList }) {
  // Aggregate per-category from entries. Items without a category fall
  // into "Bez kategorie" rather than vanishing from the visualisation.
  const byCategory = new Map<string, { weight: number; count: number }>();
  let weightedItems = 0;
  for (const e of list.entries) {
    const cat = (e.item.category || "Bez kategorie").trim();
    const w = (e.item.weight_g ?? 0) * e.quantity;
    if (e.item.weight_g != null) weightedItems += e.quantity;
    const prev = byCategory.get(cat) ?? { weight: 0, count: 0 };
    byCategory.set(cat, {
      weight: prev.weight + w,
      count: prev.count + e.quantity,
    });
  }

  const rows = [...byCategory.entries()]
    .sort((a, b) => b[1].weight - a[1].weight);
  const totalKg = list.total_weight_g / 1000;
  const maxWeight = Math.max(1, ...rows.map(([, v]) => v.weight));
  const missingWeight = list.item_count - weightedItems;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-border bg-surface-muted/30 p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Přehled
        </p>
        <span className="text-sm">
          <span className="font-semibold text-ink-900 tabular-nums">
            {totalKg.toFixed(2)} kg
          </span>{" "}
          <span className="text-ink-500">celkem</span>
        </span>
        <span className="text-sm">
          <span className="font-semibold text-ink-900 tabular-nums">
            {list.item_count}
          </span>{" "}
          <span className="text-ink-500">ks</span>
        </span>
        {missingWeight > 0 && (
          <span className="text-xs text-warning">
            {missingWeight} bez váhy
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map(([cat, { weight, count }]) => {
          const pct = (weight / maxWeight) * 100;
          const sharePct = list.total_weight_g
            ? (weight / list.total_weight_g) * 100
            : 0;
          return (
            <div key={cat} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-ink-900">{cat}</span>
                <span className="font-mono tabular-nums text-ink-500">
                  {count} ks ·{" "}
                  {weight > 0
                    ? `${(weight / 1000).toFixed(2)} kg`
                    : "—"}
                  {weight > 0 && (
                    <span className="ml-1 text-ink-300">
                      ({sharePct.toFixed(0)} %)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-surface">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.max(pct, weight > 0 ? 3 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SharePanel({
  list,
  onChange,
}: {
  list: GearList;
  onChange: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/gear/${list.slug}`
      : `/gear/${list.slug}`;

  async function setVisibility(v: GearListVisibility) {
    setBusy(true);
    try {
      await gear.updateList(list.id, { visibility: v });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const isPublic =
    list.visibility === "unlisted" || list.visibility === "public";

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-surface-muted/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Sdílení
        </p>
        <select
          disabled={busy}
          value={list.visibility}
          onChange={(e) =>
            setVisibility(e.target.value as GearListVisibility)
          }
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-700 focus-ring"
        >
          <option value="private">Soukromé (jen já)</option>
          <option value="unlisted">Nelistované (kdo má odkaz)</option>
          <option value="public">Veřejné</option>
        </select>
      </div>
      {isPublic ? (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={publicUrl}
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink-700 focus-ring"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
          >
            {copied ? "✓" : "Kopírovat"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-ink-500">
          List nevidí nikdo jiný. Přepni na „Nelistované" pro sdílení
          odkazem nebo „Veřejné" pro indexovatelnou stránku.
        </p>
      )}
    </div>
  );
}
