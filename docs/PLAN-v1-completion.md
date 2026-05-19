# OLAF V1 completion — implementační plán

Tento dokument převádí freeform brief z 2026-05-19 do prioritizovaných slices.
Pořadí slices = pořadí implementace. Každý slice je samostatně mergeable + deploable.

---

## Sliče 1 — UX detaily (rychlé wins)

**Cíl:** odstranit rušivé maličkosti, ať se s aplikací nepere.

- [ ] `/admin/komunity` tlačítko "+ Vytvořit komunitu" → `variant="secondary"` (bílé, ne oranžové).
- [ ] Tabulka v `/admin/eventy` (Level 1): klik kdekoliv v řádku otevírá detail, ne jen nadpis. Implementace přes `onClick` na `<tr>` + cursor-pointer (už existuje) + zachovat klikatelný nadpis pro a11y.
- [ ] Stejné v `/admin/komunity` a `/admin/komunity/[slug]` (tabulka eventů uvnitř).
- [ ] Stejné v `/admin/eventy/[ws]/[event]` (roster tabulka — pokud sem patří klik na řádek = profil účastníka, viz Slice 8).

**Velikost:** ~30 min. **Závislosti:** žádné.

---

## Slice 2 — Cena eventu (volitelná) + propsání na landing

**Cíl:** vytvořit event s cenou, zobrazit ji na public landing pro participant.

- [ ] DB: `Event.price_amount` (Decimal, nullable), `Event.price_currency` (CharField default "CZK"), `Event.price_note` (CharField nullable — "vč. DPH", "záloha", apod.).
- [ ] Serializer (`EventSerializer`, `EventWriteSerializer`).
- [ ] `EventForm` (`/admin/eventy/[ws]/[event]/edit/detaily`): nová Card "Cena" s checkboxem "Akce je placená" → odhalí inputy.
- [ ] Public landing (`/[ws]/e/[eventSlug]`): pokud `price_amount`, zobrazit v hero/sidebar (TBD místo) jako "2 500 Kč" + note v menším.
- [ ] Block-builder: existing `stats` block už umí cenu jako tile? Pokud ano, žádné změny tam. Jinak nový auto-render mimo bloky (status quo když event nemá hero block).

**Velikost:** ~90 min. **Závislosti:** žádné. **Migrace:** ano (Event).

---

## Slice 3 — Sdílení eventu do více komunit (workspaces)

**Cíl:** uživatel může event sdílet do více svých workspaces (Event.shared_workspaces m2m).

- [ ] DB: `Event.shared_workspaces = M2M(Workspace, related_name="shared_events", blank=True)`. Doplnit k `Event.workspace` FK (primary owner).
- [ ] Serializer: čte `shared_workspace_slugs: list[str]`, zápis přijímá list.
- [ ] View update: `_set_event_shared_workspaces(event, slugs)` — validuje že user je owner každého target workspace.
- [ ] EventForm: nová Card "Sdílení do dalších komunit" — pokud `workspaces.mine()` vrátí ≥ 2 vlastnictví, ukáže checkbox list (default: aktuální workspace zaškrtnutý a disabled).
- [ ] `/admin/komunity/[slug]` events tabulka: query = `Event.workspace == self OR self IN Event.shared_workspaces`. Tj. event vidí ve VŠECH komunitách, kam je sdílený.
- [ ] Public landing workspace (`/[slug]`): podobně, ukázat sdílené eventy.

**Velikost:** ~2 hod. **Závislosti:** Slice 1 hotov (CTA cleanup). **Migrace:** ano.

---

## Slice 4 — Rozšíření user profilu o adresu + fakturační adresu

**Cíl:** připravit user data pro fakturaci.

- [ ] DB: `User.address_street`, `User.address_city`, `User.address_zip`, `User.address_country` (CharField default "CZ"), `User.billing_*` (samá pole s prefixem billing_, nullable).
- [ ] Serializer: read/write na `/api/auth/me/` PATCH.
- [ ] `/settings/profile` (nebo kde je profil edit) — sekce "Adresa", checkbox "Mám jinou fakturační adresu" → odhalí druhý blok.

**Velikost:** ~60 min. **Závislosti:** žádné. **Migrace:** ano (User).

---

## Slice 5 — RSVP po registraci: pokyny k platbě + QR

**Cíl:** participant po dokončení registrace vidí jak zaplatit, dostane email s QR.

- [ ] DB: `RSVP.payment_status` ("pending" | "paid" | "refunded" | "waived"), `RSVP.payment_due_amount`, `RSVP.variable_symbol` (auto-generated z RSVP.id), `RSVP.paid_at`.
- [ ] Při RSVP create (pokud event má `price_amount`): spočítat `payment_due_amount`, vygenerovat `variable_symbol` (např. `event_id * 10000 + rsvp_id`).
- [ ] Backend: utility `generate_qr_platba_string(amount, vs, message, iban)` → SPAYD string. (Knihovna `qrplatba` v Pythonu, nebo ručně.) Vrátí string co kdokoliv vrazí do `qrcode` knihovny.
- [ ] Email template po registraci na placený event: variable_symbol, částka, IBAN, QR jako attachment / inline.
- [ ] `/rsvp/success` (post-registration page): zobrazí stejné info + QR (img inline).
- [ ] Workspace settings (V1 hard-code → user-editable později): IBAN majitele platforem (Olaf Adventures), bank, splatnost.

**Velikost:** ~3 hod. **Závislosti:** Slice 2 (cena), Slice 4 (užitečné ale ne blocking). **Migrace:** ano.

---

## Slice 6 — Účastnická zóna na eventu (moje registrace)

**Cíl:** přihlášený participant vidí na public landing svou registraci, pokyny k platbě, požadované dokumenty.

- [ ] Public landing event (`/[ws]/e/[eventSlug]`): pokud user authenticated AND má RSVP → nahradit "Přihlásit se" tlačítko sekcí "Jsi přihlášený" s:
  - status (yes/waitlist/pending)
  - pokyny k platbě + QR (pokud `payment_status == "pending"` AND event má cenu)
  - status požadovaných dokumentů (Slice 7)
  - tlačítko "Zrušit registraci"

**Velikost:** ~2 hod. **Závislosti:** Slice 5.

---

## Slice 7 — Dokumenty požadované po účastnících (V1 minimum)

**Cíl:** owner může na event specifikovat seznam dokumentů, participant je nahraje.

- [ ] DB: `Event.required_documents` (JSONField, list of `{key, label, required}`), `RSVPDocument(rsvp, key, file, uploaded_at)`.
- [ ] EventForm: Card "Požadované dokumenty" — multi-row builder (label + required toggle).
- [ ] Account zone (Slice 6): upload pole per required doc, status indicator.
- [ ] Admin level 2 roster: sloupec "Dokumenty" — kolik / kolik je dodáno.

**Velikost:** ~2.5 hod. **Závislosti:** Slice 6 (kde se uploadují).

---

## Slice 8 — Faktury (minimální V1)

**Cíl:** po platbě se vygeneruje faktura, owner i participant ji vidí, owner ji může editovat.

- [ ] DB: `Invoice(rsvp, number, issued_at, supplier_*, customer_*, items_json, total, vat_rate, vat_amount, status)`. Číselná řada (NNNN/YYYY) per workspace.
- [ ] Při `RSVP.payment_status` → "paid" (manuálně z admina nebo z webhook v V1.5): vygeneruj `Invoice` z user.address (nebo user.billing_*) + event.price.
- [ ] Owner cockpit: `/admin/eventy/[ws]/[event]/edit/faktury` (nový sub-page) — list faktur s odkazem.
- [ ] Invoice detail/edit page: editovatelná všechna pole, save → re-render PDF.
- [ ] PDF render: jednoduchý HTML → PDF (knihovna `weasyprint`).
- [ ] Participant zone: link "Stáhnout fakturu" pod payment block (Slice 6).

**Velikost:** ~4-5 hod. **Závislosti:** Slice 4 (adresy), Slice 5 (payment status).

---

## Slice 9 — Členové komunity

**Cíl:** owner vidí list členů s aktivitou, klik = profil.

- [ ] Backend: `/api/workspaces/[slug]/members/` endpoint — list `WorkspaceMember`s + stats (RSVP count past, RSVP count upcoming).
- [ ] `/admin/komunity/[slug]/clenove` page: tabulka jméno / role / akce historicky / nadcházející / klik na řádek = profil.
- [ ] Profil člena (`/admin/komunity/[slug]/clenove/[userId]`): basic info + list RSVP s odkazem na eventy.
- [ ] Update admin sidebar: "Členové" item získá počet badge per komunita (později).

**Velikost:** ~2 hod. **Závislosti:** žádné.

---

## Slice 10 — Nástěnka (komunikace) v komunitě i na eventu

**Cíl:** owner i členové můžou postnout topic/comment v komunitě nebo na eventu.

- [ ] DB: `Discussion(parent_type, parent_id, title, body, pinned, author, created_at)`, `DiscussionComment(discussion, body, author, created_at)`.
- [ ] `parent_type` = "workspace" | "event".
- [ ] Endpoints: list/create/comment.
- [ ] Komunita detail: záložka "Nástěnka" — pin topics on top, list per created_at desc.
- [ ] Event detail (participant zone): záložka "Nástěnka" — totéž v rámci eventu.
- [ ] Owner moderation: edit/delete vlastní + cizí (pinned only owner).

**Velikost:** ~5 hod. **Závislosti:** žádné. **V1.5 candidate** — větší kus.

---

## Doporučené pořadí

1. Slice 1 (UX detaily) — žádné migrace, rychlé wins.
2. Slice 2 (cena) — odemyká Slice 5.
3. Slice 4 (adresy) — odemyká Slice 8.
4. Slice 3 (sharing) — UX bonus, snadné.
5. Slice 5 (QR platba) — kritické pro real summer/autumn camp.
6. Slice 6 (účastnická zóna) — participant flow.
7. Slice 8 (faktury) — owner workflow.
8. Slice 7 (dokumenty) — nice-to-have V1.
9. Slice 9 (členové) — owner workflow.
10. Slice 10 (nástěnka) — V1.5.

Slices 1-2 + 4 lze prošlapnout v jedné session (~3 hod). Pak Slice 3.
Pak Slice 5 (samostatně, kritické). Pak 6+8 dohromady. Pak 7+9 dohromady.
Slice 10 zvlášť, vyžaduje vlastní design pass.
