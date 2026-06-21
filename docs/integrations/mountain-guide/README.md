# Mountain-guide → OLAF event import

Workflow pro tvorbu eventu mimo OLAF UI — připravíš si akci v
externím Claude Code projektu (typicky `mountain-guide`) a jedním
příkazem ji nahraješ do OLAFu jako rozpracovaný draft. Pak už jen
v `/admin/events/<slug>/edit` doladíš registraci, ceník atd. a
publikuješ.

## Jak to funguje

```
┌──────────────────────────┐                 ┌──────────────────────┐
│  mountain-guide projekt  │  /olaf-publish  │   OLAF aplikace      │
│  events/beskydy.md       │  ─────────────▶ │  POST /api/events/…  │
│                          │                 │  /import/            │
│  Markdown s programem    │                 │                      │
│  + obrázky URL           │                 │  → Draft Event       │
└──────────────────────────┘                 │  → Landing bloky     │
                                             │  → edit_url v odpovědi│
                                             └──────────────────────┘
```

Claude Code skill převede markdown spec na JSON odpovídající
`/api/events/import-schema/` a POSTne na `/api/events/<workspace>/import/`
s tvým osobním tokenem. Endpoint je **idempotentní** — když pošleš
re-import se stejným `external_ref`, OLAF aktualizuje existující event
namísto vytvoření duplikátu.

> Bezpečnostní gate: import **vždy** vytvoří akci jako `draft`. Veřejné
> publikování nikdy neproběhne automaticky — finální `Publikovat`
> tlačítko zůstává v OLAF UI.

## Instalace (jednorázově)

### 1. Vygeneruj API token

V OLAFu otevři `/settings/integrations/`, klikni **Vytvořit token**,
pojmenuj ho (např. „mountain-guide laptop") a **zkopíruj plaintext**
(zobrazí se jen jednou).

### 2. Přidej token do mountain-guide projektu

```bash
echo 'OLAF_API_TOKEN=<paste-token-here>' >> .env
echo 'OLAF_BASE_URL=https://olaf.events' >> .env
echo 'OLAF_WORKSPACE_SLUG=olaf-adventures' >> .env
```

### 3. Nainstaluj skill

Z OLAF repo zkopíruj `docs/integrations/mountain-guide/SKILL.md` do
mountain-guide projektu jako `.claude/skills/olaf-publish/SKILL.md` a
`publish.py` ke kořeni mountain-guide.

```bash
mkdir -p .claude/skills/olaf-publish
cp /path/to/olaf/docs/integrations/mountain-guide/SKILL.md .claude/skills/olaf-publish/
cp /path/to/olaf/docs/integrations/mountain-guide/publish.py .
```

## Použití

V mountain-guide projektu napíšeš (nebo si necháš Claudem vygenerovat)
markdown spec akce — viz `example/beskydy-spring-camp.md` v této
složce jako kanonický příklad.

Pak v Claude Code:

```
/olaf-publish events/beskydy-spring-camp.md
```

Skill:

1. Načte aktuální schema z `/api/events/import-schema/`
2. Z markdown specu poskládá JSON payload
3. POSTne na `/api/events/<workspace>/import/`
4. Vrátí ti `edit_url` na rozpracovaný draft

Otevřeš `edit_url`, doladíš registraci/ceník a klikneš **Publikovat**.

## Manuální curl (bez Claude Code)

Když chceš obejít skill, payload vykouzlíš ručně:

```bash
curl -X POST $OLAF_BASE_URL/api/events/$OLAF_WORKSPACE_SLUG/import/ \
  -H "Authorization: Bearer $OLAF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @example/beskydy-spring-camp.json
```

Odpověď (201 nebo 200 při update):

```json
{
  "event_id": 42,
  "workspace_slug": "olaf-adventures",
  "event_slug": "beskydy-spring-camp",
  "external_ref": "beskydy-spring-camp-2026",
  "status": "draft",
  "created": true,
  "edit_url": "https://olaf.events/admin/events/beskydy-spring-camp/edit",
  "public_url": "https://olaf.events/olaf-adventures/e/beskydy-spring-camp"
}
```

## Re-import (idempotence)

Pošli stejný `external_ref` → update místo create. Pole, která v
payloadu **nepošleš**, zůstávají beze změny (PATCH semantika).
Workflow:

* První import: zapiš `external_ref: "beskydy-spring-camp-2026"`.
* Druhý běh (oprava popisu): stejný `external_ref`, jiný `description`.
* OLAF udrží stejný `event_id` + slug + RSVPs.

## Chyby

| Status | Význam                                                              |
| ------ | ------------------------------------------------------------------- |
| 400    | Špatný payload — chybějící pole, neznámý block type, špatný slug.   |
| 401    | Token chybí / je revokovaný / neexistuje. Zkontroluj `OLAF_API_TOKEN`.|
| 403    | Token patří uživateli, který není owner/admin daného workspacu.     |
| 404    | `workspace-slug` v URL neexistuje.                                  |

## Soubory v této složce

* `README.md` (tento soubor)
* `SKILL.md` — Claude Code skill manifest (drop do `.claude/skills/olaf-publish/`)
* `publish.py` — helper script s logikou (drop do mountain-guide root)
* `example/beskydy-spring-camp.md` — kanonický markdown spec
* `example/beskydy-spring-camp.json` — výsledný JSON payload (reference)
