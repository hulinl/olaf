---
name: olaf-publish
description: Convert a markdown event spec into the OLAF import payload and POST it to the configured workspace as a draft event. Use this when the user wants to "publish to OLAF", "push this event to OLAF", or runs `/olaf-publish <file>`. Reads OLAF_API_TOKEN, OLAF_BASE_URL, OLAF_WORKSPACE_SLUG from .env.
---

# OLAF event publish skill

## When to use

Invoke this skill whenever the user wants to take a prepared event
spec (markdown with sections for hero, days, included/not-included,
FAQ, etc.) and push it to OLAF as a draft event for the configured
workspace. Triggered by `/olaf-publish <path>` or by natural phrasing
like "publish this event to OLAF" / "push this to olaf as a draft".

## What you do

1. **Read the markdown spec** the user pointed you to. Default file:
   the only `.md` under `events/`, or the file the user named. The
   spec follows the shape shown in `example/beskydy-spring-camp.md`
   in the OLAF integrations folder — a YAML frontmatter for event
   mechanics (title, slug, dates, capacity, price) and a body with
   H2 sections for the landing-page blocks.

2. **Fetch the live schema** from `$OLAF_BASE_URL/api/events/import-schema/`.
   This is the source of truth for block types and their fields. If
   the fetch fails (offline, server down), fall back to the
   block-type list in this file — but warn the user that the cached
   list might be stale.

3. **Translate the spec into a payload** matching the schema:
   * Required event fields: `slug`, `title`, `starts_at`, `ends_at`.
   * Optional: `description`, `tz` (default `Europe/Prague`),
     `location_text`, `meeting_point_text`, `location_url`,
     `capacity`, `price_amount`, `price_currency` (default `CZK`),
     `price_note`, `payment_in_cash`.
   * `external_ref`: derive from the markdown filename (without `.md`)
     + `-` + year from `starts_at`. This is the idempotency key —
     same input file = same external_ref = re-import updates in
     place, no duplicate.
   * `blocks`: ordered list of `{id, type, payload}`. Map H2 sections
     to block types using the heuristics in the next section.

4. **POST the payload** to
   `$OLAF_BASE_URL/api/events/$OLAF_WORKSPACE_SLUG/import/` with the
   `Authorization: Bearer $OLAF_API_TOKEN` header. Use
   `publish.py` if it exists in the project root — it handles the
   .env loading + auth header + sensible error messages.

5. **Report the result** to the user:
   * On success (201 or 200): print the `edit_url` and tell the
     user to open it to fine-tune registration / pricing / capacity.
   * On 400: surface the field/block error so the user can fix the
     markdown.
   * On 401: tell the user the token is missing/revoked and how to
     regenerate it.
   * On 403: the token belongs to a user who isn't an owner of the
     configured workspace.

## Markdown → block mapping

The spec uses H2 (`##`) section headers. Map each header to a block
type by keyword:

| Header keyword (case-insensitive) | Block type        |
| --------------------------------- | ----------------- |
| Hero, Cover, Intro                | `hero` (always #1)|
| Přehled, O výpravě, About         | `prose`           |
| Statistiky, Stats, Čísla          | `stats`           |
| Program, Dny, Itinerář            | `days`            |
| V ceně, Cena, Co je v ceně        | `included_split`  |
| Galerie, Fotky, Gallery           | `gallery`         |
| Mapa, Map                         | `map`             |
| FAQ, Otázky, Časté dotazy         | `faq`             |
| Praktické, Vybavení (krátké), Difficulty | `practical`|
| Gear, Vybavení (full list)        | `gear`            |

Block `id`s should be short, hyphenated, unique within the event
(e.g. `hero`, `days-program`, `faq`).

## Block payload shapes (cheat sheet)

Always cross-check against the live schema; this is a quick reference.

* **hero**: `cover_url`, `eyebrow` (short label above title),
  `title_override` (optional override of event.title on the hero),
  `subtitle`, `cta_label`, `cta_href` (typically `#prihlaska`),
  `meta` (list of `{k, v}` tiles — délka, převýšení, ...).
* **prose**: `eyebrow`, `heading`, `body` (plain text, newlines =
  paragraphs), `image_url`, `image_side` (`left` or `right`).
* **stats**: `dark` (bool), `tiles` (list of `{label, value}`).
* **days**: `lead` (intro), `days` (list with `label`, `num`,
  `title`, `route`, `body`, `time`, `distance`, `ascent`,
  `descent`, `image_url`, `map_url`).
* **included_split**: `price_value`, `price_unit`, `price_note`,
  `included` + `not_included` (each list of `{label, desc}`).
* **gallery**: `eyebrow`, `title` (images come from event.images,
  not from this block).
* **map**: `eyebrow`, `title`, `caption`, `map_url`.
* **faq**: `eyebrow`, `title`, `items` (list of `{question, answer}`).
* **practical**: `eyebrow`, `title`, `transport`, `accommodation`,
  `gear`, `difficulty_level` (0-5), `difficulty_note`.
* **gear**: `list_slug` (slug of a GearList already in the
  workspace), `eyebrow`, `title`, `featured_entry_ids` (optional).

## Output format

After a successful publish, tell the user:

```
Draft event "<title>" created/updated in OLAF.

Edit:   <edit_url>
Public: <public_url>
Ref:    <external_ref>

Otevři edit URL, zkontroluj kapacitu / cenu / RSVP a klikni
Publikovat až bude akce ready.
```

Czech tone — the OLAF owner is a Czech speaker. Mirror their
language unless they ask in English.

## What NOT to do

* Don't publish the event automatically — the importer always
  lands it as draft, and the owner flips the gate. If the user asks
  "publish it live", tell them you can only push the draft; final
  publish has to happen in OLAF UI.
* Don't change `external_ref` between runs of the same source file.
  That would create duplicates instead of updating.
* Don't invent block types not in the cheat sheet — the server will
  reject them with 400.
