"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type GearItem,
  type GearList,
  gear,
} from "@/lib/api";

/**
 * /settings/gear — user-scoped gear catalog + named lists.
 *
 * Two sections: Vybavení (items library) at top, Listy (assemblies)
 * below. Items can live in 0..N lists; lists are reusable across
 * trips. Public sharing + event integration is V2.
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
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold text-ink-900">Vybavení</h2>
          <p className="mt-1 text-sm text-ink-500">
            Tvoje osobní katalog vybavení — z těchto položek pak skládáš
            listy pro konkrétní akce (např. „Beskická 7"). Váha v gramech,
            URL ideálně přímo na e-shop.
          </p>
        </CardSection>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <ItemSection items={items} onChange={reload} />
      <ListSection lists={lists} items={items} onChange={reload} />
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
