"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type GearCategory,
  type GearImportResult,
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
  const [categories, setCategories] = useState<GearCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const [is, ls, cs] = await Promise.all([
        gear.listItems(),
        gear.listLists(),
        gear.listCategories(),
      ]);
      setItems(is);
      setLists(ls);
      setCategories(cs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (!items || !lists || !categories) {
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

      <CategorySection categories={categories} items={items} onChange={reload} />
      <ItemSection
        items={items}
        categories={categories}
        onChange={reload}
      />
      <ListSection lists={lists} items={items} onChange={reload} />
      <ImportSection onChange={reload} />
      <AffiliateSection />
    </div>
  );
}

function CategorySection({
  categories,
  items,
  onChange,
}: {
  categories: GearCategory[];
  items: GearItem[];
  onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count items per category so the owner can see what's actually used.
  const usageById = new Map<number, number>();
  for (const i of items) {
    if (i.category_id == null) continue;
    usageById.set(i.category_id, (usageById.get(i.category_id) ?? 0) + 1);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      await gear.createCategory(n);
      setNewName("");
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Vytvoření selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(c: GearCategory, name: string) {
    if (name === c.name) return;
    try {
      await gear.updateCategory(c.id, { name });
      await onChange();
    } catch {
      /* keep silent */
    }
  }

  async function remove(c: GearCategory) {
    const usage = usageById.get(c.id) ?? 0;
    const ok = confirm(
      usage > 0
        ? `Smazat kategorii „${c.name}"? Položky zůstanou, ale ztratí kategorii (${usage} ks).`
        : `Smazat kategorii „${c.name}"?`,
    );
    if (!ok) return;
    try {
      await gear.deleteCategory(c.id);
      await onChange();
    } catch {
      /* keep silent */
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
              Kategorie ({categories.length})
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Vlastní slovník pro tvůj gear — z těchto kategorií pak vybíráš
              při zakládání položky. Přejmenování se propíše do všech věcí.
            </p>
          </div>
          <span
            aria-hidden
            className={open ? "rotate-90 text-ink-500" : "text-ink-500"}
          >
            ›
          </span>
        </button>

        {open && (
          <div className="mt-4 flex flex-col gap-2">
            {categories.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
                Zatím žádné kategorie. Přidej první níže nebo nech je založit
                importem.
              </p>
            ) : (
              categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  usage={usageById.get(c.id) ?? 0}
                  onRename={(name) => rename(c, name)}
                  onDelete={() => remove(c)}
                />
              ))
            )}

            <form onSubmit={create} className="mt-2 flex flex-wrap gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="např. Spaní"
                maxLength={60}
                className="flex-1 min-w-[200px]"
              />
              <Button type="submit" variant="primary" size="md" loading={busy}>
                {busy ? "..." : "Přidat kategorii"}
              </Button>
            </form>
            {error && <Alert variant="danger">{error}</Alert>}
          </div>
        )}
      </CardSection>
    </Card>
  );
}

function CategoryRow({
  category,
  usage,
  onRename,
  onDelete,
}: {
  category: GearCategory;
  usage: number;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== category.name) onRename(name.trim());
        }}
        maxLength={60}
        className="flex-1 min-w-[160px] rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink-900 focus-ring"
      />
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-500">
        {usage} ks
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs font-medium text-ink-500 hover:text-danger"
      >
        Smazat
      </button>
    </div>
  );
}

function ImportSection({ onChange }: { onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GearImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await gear.importCsv(file);
      setResult(r);
      await onChange();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Import selhal.",
      );
    } finally {
      setBusy(false);
      // Reset the input so re-uploading the same file fires onChange again.
      e.target.value = "";
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
              Import z Notion CSV
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Máš svůj gear v Notion databázi? Exportuj ji jako CSV (View
              → ⋯ → Export → Format: CSV) a nahraj sem. Položky se
              upsertují podle názvu, listy podle Notion UUID — re-import
              je bezpečný.
            </p>
          </div>
          <span aria-hidden className={open ? "rotate-90 text-ink-500" : "text-ink-500"}>
            ›
          </span>
        </button>

        {open && (
          <div className="mt-4 flex flex-col gap-3">
            <label
              className={[
                "flex flex-col items-start gap-2 rounded-md border border-dashed bg-surface-muted/30 p-4 text-sm",
                busy ? "opacity-60" : "cursor-pointer hover:border-brand",
                "border-border-strong",
              ].join(" ")}
            >
              <span className="font-medium text-ink-900">
                {busy ? "Importuju…" : "Vyber CSV soubor"}
              </span>
              <span className="text-xs text-ink-500">
                Očekávané sloupce: name, category, link, gear list, unit
                weight [grams], qty, type, specific type, price.
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={handleFile}
                className="hidden"
              />
            </label>

            {result && (
              <Alert variant="success">
                Import dokončen — {result.rows} řádků zpracováno.
                Vytvořeno {result.items_created} položek,{" "}
                {result.items_backfilled} doplněno o chybějící pole.
                Listů: {result.lists_total}. Vazeb položka↔list:{" "}
                {result.edges_created}.
              </Alert>
            )}
            {error && <Alert variant="danger">{error}</Alert>}
          </div>
        )}
      </CardSection>
    </Card>
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
  categories,
  onChange,
}: {
  items: GearItem[];
  categories: GearCategory[];
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
            categories={categories}
            onCancel={() => setComposerOpen(false)}
            onSave={async (payload) => {
              await gear.createItem(payload);
              setComposerOpen(false);
              await onChange();
            }}
            onCategoryAdded={onChange}
          />
        )}

        {items.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
            Žádné položky. Začni přidáním prvního kusu vybavení.
          </p>
        ) : (
          // No outer border — the Card already provides one, doubling
          // it up made it look like "table inside a table". Header gets
          // a bottom border instead.
          <div className="mt-4 -mx-3 overflow-x-auto sm:-mx-4">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">Položka</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Kategorie</th>
                  <th className="px-3 py-2 text-right">Váha</th>
                  <th className="hidden px-3 py-2 lg:table-cell">Odkaz</th>
                  <th className="hidden px-3 py-2 lg:table-cell">Poznámka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i) => (
                  <ItemRow
                    key={i.id}
                    item={i}
                    categories={categories}
                    onChange={onChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardSection>
    </Card>
  );
}

function ItemRow({
  item,
  categories,
  onChange,
}: {
  item: GearItem;
  categories: GearCategory[];
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="bg-surface-muted/30">
        <td colSpan={5} className="p-3">
          <ItemEditor
            initial={item}
            categories={categories}
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
            onCategoryAdded={onChange}
          />
        </td>
      </tr>
    );
  }

  const weightLabel =
    item.weight_g == null
      ? "—"
      : item.weight_g >= 1000
        ? `${(item.weight_g / 1000).toFixed(2)} kg`
        : `${item.weight_g} g`;

  return (
    <tr
      onClick={() => setEditing(true)}
      className="cursor-pointer hover:bg-brand/5"
    >
      <td className="px-3 py-2">
        <span className="font-medium text-ink-900">{item.name}</span>
        {/* On small screens collapse category + link hints under the
            title since the columns are hidden. */}
        <span className="ml-2 text-xs text-ink-500 sm:hidden">
          {item.category && <>{item.category}</>}
          {item.url && <span className="ml-2 text-brand">↗</span>}
        </span>
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-ink-700 sm:table-cell">
        {item.category ? (
          <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {item.category}
          </span>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-ink-700">
        {weightLabel}
      </td>
      <td className="hidden max-w-[1px] px-3 py-2 lg:table-cell">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-brand hover:underline"
            title={item.url}
          >
            {new URL(item.url).hostname.replace(/^www\./, "")} ↗
          </a>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="hidden max-w-[1px] truncate px-3 py-2 text-xs text-ink-500 lg:table-cell">
        {item.note || ""}
      </td>
    </tr>
  );
}

function ItemEditor({
  initial,
  categories,
  onSave,
  onCancel,
  onDelete,
  onCategoryAdded,
}: {
  initial?: GearItem;
  categories: GearCategory[];
  onSave: (payload: {
    name: string;
    weight_g: number | null;
    url: string;
    category_id: number | null;
    note: string;
  }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onCategoryAdded?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [weight, setWeight] = useState(
    initial?.weight_g != null ? String(initial.weight_g) : "",
  );
  const [url, setUrl] = useState(initial?.url ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(
    initial?.category_id ?? null,
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const w = weight.trim();
      await onSave({
        name: name.trim(),
        weight_g: w ? Math.max(0, parseInt(w, 10) || 0) : null,
        url: url.trim(),
        category_id: categoryId,
        note: note.trim(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const n = newCategoryName.trim();
    if (!n) return;
    try {
      const cat = await gear.createCategory(n);
      setCategoryId(cat.id);
      setNewCategoryName("");
      setCreatingCategory(false);
      if (onCategoryAdded) await onCategoryAdded();
    } catch {
      /* keep silent — owner can retry */
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
        <Field
          label="Kategorie"
          htmlFor="gi-cat"
          hint={
            categories.length === 0
              ? "Žádné kategorie zatím nejsou — vytvoř jednu tlačítkem níže."
              : 'Vyber ze seznamu, nebo přidej novou.'
          }
        >
          {!creatingCategory ? (
            <div className="flex flex-wrap gap-2">
              <select
                id="gi-cat"
                value={categoryId ?? ""}
                onChange={(e) =>
                  setCategoryId(e.target.value ? Number(e.target.value) : null)
                }
                className="flex-1 min-w-[140px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
              >
                <option value="">— bez kategorie —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreatingCategory(true)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-muted"
              >
                + Nová
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="např. Spaní"
                maxLength={60}
                className="flex-1 min-w-[140px]"
                autoFocus
              />
              <button
                type="button"
                onClick={addCategory}
                className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-brand-ink hover:opacity-90"
              >
                Přidat
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingCategory(false);
                  setNewCategoryName("");
                }}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-muted"
              >
                Zrušit
              </button>
            </div>
          )}
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
  const [pickedId, setPickedId] = useState<number | null>(null);
  // Sort by category then name so the dropdown groups items naturally.
  // 79+ items in a grid was overwhelming; dropdown + group is calmer.
  const sorted = [...items].sort((a, b) => {
    const ca = a.category || "Bez kategorie";
    const cb = b.category || "Bez kategorie";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.name.localeCompare(b.name);
  });
  // Group by category for <optgroup>.
  const byCategory = new Map<string, GearItem[]>();
  for (const i of sorted) {
    const c = i.category || "Bez kategorie";
    const arr = byCategory.get(c) ?? [];
    arr.push(i);
    byCategory.set(c, arr);
  }

  async function confirm() {
    if (pickedId == null) return;
    await onPick(pickedId);
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-surface-muted/30 p-3">
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
      <div className="flex flex-wrap gap-2">
        <select
          value={pickedId ?? ""}
          onChange={(e) =>
            setPickedId(e.target.value ? Number(e.target.value) : null)
          }
          className="flex-1 min-w-[200px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
        >
          <option value="">— vyber položku —</option>
          {[...byCategory.entries()].map(([cat, list]) => (
            <optgroup key={cat} label={cat}>
              {list.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.weight_g != null ? ` · ${i.weight_g} g` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={confirm}
          disabled={pickedId == null}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50 focus-ring"
        >
          Přidat
        </button>
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
