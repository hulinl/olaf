# OLAF — kompletní stav po V1+

Tento dokument byl původně plánem implementace V1 slices. Všechny slices
jsou hotové a deployed. Necháváme ho jako **kompletní recap** toho, co je
v produkci, plus aktuální backlog. Aktualizováno 2026-05-20.

**Live:** `olaf.events` (Azure SWA) + `api.olaf.events` (Azure Container
Apps). Deploy přes `./infra/deploy.sh build && release`.

---

## ✅ V1 — všechny slices shipped

| # | Slice | PR |
|---|---|---|
| 1 | UX detaily (klikatelné řádky, secondary CTA) | #27 |
| 2 | Event price + landing strip | #27 |
| 3 | Cross-workspace sharing (Event.shared_workspaces m2m) | #29 |
| 4 | User structured address + billing address | #28 |
| 5 | QR Platba (SPAYD + auto-VS + email block) | #30 |
| 6 | Participant payment zone (`<PaymentInstructionsPanel>`) | #30 |
| 7 | Required documents per event + upload panel | #32 |
| 8 | Invoices auto-generate on payment + PDF (WeasyPrint) | #33, #36, #40 |
| 9 | Členové komunity (list + detail) | #31 |
| 10 | Nástěnka (Discussion + komentáře) | #43 |

Plus všechno mimo původní slice plán:

- **Brand v1 (Sunrise)** — #12
- **Block-based event landing** + builder UI (hero/prose/days/stats/included_split/gallery/map/faq/practical) — #11, #13
- **Owner cockpit** (Tvůrce shell, /admin/*) + dual dashboard — #14, #25
- **Event-first model** (lazy personal workspace) — #48
- **Roadmapa (checklist) + scheduled reminders** — #44, #46
- **PWA Phase 1** (manifest, A2HS) — #58
- **PWA Phase 2** (Web Push, VAPID) — #60, #62, #74 fix
- **Azure deploy stack** (Bicep) — #22
- **Mobile polish pass** — #49, #50
- **Czech e-mail templates** — #21, #63
- **Production seed migration** (Olaf Adventures workspace) — `workspaces.0003`

---

## ✅ Day 1 V1.5+ — shipped 2026-05-20

| Feature | PR |
|---|---|
| E-mail polish (Czech date, čistší podpisy) | #63 |
| Lidé CRM-lite | #64 |
| Multi-admin komunity (owner can promote → admin) | #65 |
| Gear catalog + lists | #66 |
| Event co-creators | #67 |
| Hand-over ownership + affiliate partners | #68 |
| Public gear lists (slug + visibility) | #69 |
| Gear click tracking (redirect + counts) | #70 |
| Share buttons (event + komunita, admin + public) | #71 |
| Co-creator picker from Lidé | #72 |

---

## 📋 Backlog

### V1.5 — krátkodobé

- **Fio bank email reconciliation** — parsing notifikace → match na VS →
  auto mark-as-paid. Nahradí manuální „Označit zaplaceno". ~3 h.
- **iDoklad API integrace** — auto-vystavení faktur do účetnictví. User
  pitchoval 2026-05-18. ~4 h.
- **Letní kemp 2026 event v produkci** — content task, dělat přes UI po
  loginu (memory: `project_olaf_shipping_path.md`).

### V2 — později

- **Role-scoped collaborators** — sekretářka edituje jen faktury, content
  editor jen obsah. V1 co-creator je binární full-access.
- **Risk Management** — auto-generated risk checklist per event.
  Canonical example = Reunion trek doc na Desktopu.
- **Lidé CRM rozšíření** — tagy, notes, „send mail to selected", export.
- **Gear → event integrace** — creator reference svůj gear list jako
  „required gear" example.
- **CZ překlad UI** — explicitně **nikdy ne next slice**; až po dalších
  V1 features (memory: `feedback_czech_last.md`).

### Mimo scope V1 (PRD §11 non-goals)

Platby (V1 má manuální QR + manual match — V1.5 přidá auto-reconciliation,
ne mimo scope), native apps, OAuth, SMS, AI, custom domains, gear
marketplace, gamification.

---

## ⚠️ Známé gotchas

- **VAPID base64** — multiline secrets v Container App musí být
  base64-encoded single line. Detaily v `apps/api/notifications/README.md`.
- **`py_vapid.Vapid.from_string` lže** — chce raw base64 url-safe bez PEM
  banners. Helper `_vapid_private_key()` v `notifications/push.py`.
- **CI fixtures** — `workspaces.0003_seed_olaf_adventures` skipuje se
  v testech via `if "test" in sys.argv: return`.
- **Web SWA deploy** běží paralelně s API rollout, dobíhá ~3-5 min po
  merge na main.

---

## Doporučené pořadí dalších kroků

1. **Fio bank reconciliation** — odstraní jedinou manuální tření
   v platebním flow. Jakmile někdo začne na olaf.events platit, ručně to
   nezvládneš.
2. **Letní kemp 2026 do produkce** — bez aktivního eventu je olaf.events
   funkční ale prázdná demo. ~30 min přes UI.
3. **iDoklad integrace** — váže se na Fio (na zaplacení vystavit do
   účetnictví).
