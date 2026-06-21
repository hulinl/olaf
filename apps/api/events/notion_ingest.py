"""Notion → Claude → draft Event ingest pipeline (V2.1).

Three steps:

1. **Resolve the URL.** Pull the 32-char page id out of various Notion
   URL shapes the user might paste — `notion.so/<workspace>/<title>-<id>`,
   `notion.so/<id>`, the bare id, etc.

2. **Fetch the page.** Use the calling user's stored Notion integration
   token to call the Notion API. Walks the block tree recursively and
   flattens to plain text. Skips non-textual blocks (images, embeds,
   code) — extracted content is sent to an LLM, not used for layout.

3. **Extract a draft Event.** Send the flattened text + a JSON schema
   description to Claude, get back a structured payload mapping to
   EventWriteSerializer fields. The result is NOT persisted; the
   ingest view returns it so the owner can review + edit in the
   normal event form.

External calls use stdlib `urllib` deliberately — keeps the dep
surface small (no `requests`, no `notion-client`, no `anthropic`).
Both APIs are simple JSON-over-HTTP.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_API_VERSION = "2022-06-28"
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
# Current largest Claude model. Override via settings if Anthropic
# renames or releases a stronger one — extraction quality matters
# more than per-call cost (a few cents per page).
ANTHROPIC_MODEL = getattr(
    settings, "ANTHROPIC_INGEST_MODEL", "claude-opus-4-5"
)

# Hard caps so a single malicious URL can't burn the token bill.
MAX_INGEST_TEXT_CHARS = 25_000
MAX_ANTHROPIC_TOKENS_OUT = 2_000


class IngestError(Exception):
    """Surface-level error returned to the API caller as a 4xx/5xx."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# 1. URL → page id
# ---------------------------------------------------------------------------


_PAGE_ID_RE = re.compile(r"([0-9a-fA-F]{32})")
_DASHED_PAGE_ID_RE = re.compile(
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
)


def extract_notion_page_id(url_or_id: str) -> str | None:
    """Extract a 32-char hex page id from any Notion-flavoured input.

    Accepts:
    - Bare 32-char hex `abcdef0123...`
    - Dashed UUID `abcdef01-2345-...` (Notion sometimes serves these)
    - Public web URL `https://www.notion.so/Workspace/Page-Title-abcdef0123...`
    - Share-to-web URL `https://workspace.notion.site/...`
    """
    if not url_or_id:
        return None
    raw = url_or_id.strip()
    # Dashed UUID? Strip dashes.
    m = _DASHED_PAGE_ID_RE.search(raw)
    if m:
        return m.group(1).replace("-", "")
    # Bare hex id (or trailing id in a URL slug).
    m = _PAGE_ID_RE.search(raw)
    if m:
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# 2. Notion API fetch
# ---------------------------------------------------------------------------


def _notion_request(path: str, token: str) -> dict[str, Any]:
    """GET against the Notion API. Raises IngestError on non-2xx so
    the view can map back to a user-readable message."""
    url = f"{NOTION_API_BASE}{path}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code == 401:
            raise IngestError(
                "Notion token je neplatný — vygeneruj nový a vlož do "
                "/settings/integrace.",
                status_code=400,
            ) from e
        if e.code == 404:
            raise IngestError(
                "Notion stránku se nepodařilo otevřít. Otevři ji v "
                "Notionu → ⋯ → Connections → vyber svoji integraci a "
                "zkus to znovu.",
                status_code=400,
            ) from e
        raise IngestError(
            f"Notion API vrátilo chybu ({e.code}): {body[:200]}",
            status_code=502,
        ) from e
    except urllib.error.URLError as e:
        raise IngestError(
            f"Notion API nedosažitelné: {e.reason}",
            status_code=502,
        ) from e


def _block_to_text(block: dict[str, Any]) -> str:
    """Best-effort textual rendering of a single Notion block.

    Each block type stores its content in a sub-dict keyed by the type
    (e.g. `paragraph.rich_text`). Most rich-text-bearing blocks share
    the same shape; we look it up generically. Non-text blocks (image,
    embed, code, divider, …) emit nothing — the LLM extracts event
    fields from prose, not from screenshots.
    """
    btype = block.get("type") or ""
    payload = block.get(btype) or {}
    rich = payload.get("rich_text")
    if not isinstance(rich, list):
        return ""
    parts = []
    for rt in rich:
        text = (rt.get("plain_text") or "").strip()
        if text:
            parts.append(text)
    line = " ".join(parts).strip()
    if not line:
        return ""
    # Lightweight markdown so the LLM still recognises structure even
    # though we stripped formatting.
    if btype == "heading_1":
        return f"# {line}"
    if btype == "heading_2":
        return f"## {line}"
    if btype == "heading_3":
        return f"### {line}"
    if btype in ("bulleted_list_item", "to_do"):
        return f"- {line}"
    if btype == "numbered_list_item":
        return f"1. {line}"
    if btype == "quote":
        return f"> {line}"
    return line


def _property_to_lines(name: str, prop: dict[str, Any]) -> list[str]:
    """Flatten one Notion property to plain-text lines the LLM can read.

    Notion database items put canonical fields (date, price, capacity,
    tags) as *properties*, not as page-body blocks. Without this the
    ingest only sees free-text the organiser dropped into the page
    body — date/price columns are invisible. We surface every common
    property type as a `Name: value` line so Claude has both surfaces.
    """
    ptype = prop.get("type")
    if not ptype:
        return []
    value = prop.get(ptype)
    if value is None or value == "":
        return []
    if ptype == "title":
        text = "".join(
            rt.get("plain_text", "")
            for rt in value
            if isinstance(rt, dict)
        ).strip()
        return [f"# {text}"] if text else []
    if ptype == "rich_text":
        text = "".join(
            rt.get("plain_text", "")
            for rt in value
            if isinstance(rt, dict)
        ).strip()
        return [f"{name}: {text}"] if text else []
    if ptype == "date":
        start = value.get("start")
        end = value.get("end")
        if start and end and start != end:
            return [f"{name}: {start} – {end}"]  # noqa: RUF001 — en-dash je intentional v Czech datovém range
        if start:
            return [f"{name}: {start}"]
        return []
    if ptype == "number":
        return [f"{name}: {value}"]
    if ptype in ("url", "email", "phone_number"):
        return [f"{name}: {value}"]
    if ptype == "checkbox":
        return [f"{name}: {'ano' if value else 'ne'}"]
    if ptype in ("select", "status"):
        n = value.get("name") if isinstance(value, dict) else None
        return [f"{name}: {n}"] if n else []
    if ptype == "multi_select":
        names = [
            opt.get("name", "")
            for opt in value
            if isinstance(opt, dict) and opt.get("name")
        ]
        return [f"{name}: {', '.join(names)}"] if names else []
    if ptype == "people":
        names = [
            p.get("name", "")
            for p in value
            if isinstance(p, dict) and p.get("name")
        ]
        return [f"{name}: {', '.join(names)}"] if names else []
    if ptype == "files":
        urls: list[str] = []
        for f in value if isinstance(value, list) else []:
            if not isinstance(f, dict):
                continue
            url = ""
            if "external" in f and isinstance(f["external"], dict):
                url = f["external"].get("url", "")
            elif "file" in f and isinstance(f["file"], dict):
                url = f["file"].get("url", "")
            if url:
                urls.append(url)
        return [f"{name}: {', '.join(urls)}"] if urls else []
    # Skip relation / rollup / formula / created_by / created_time /
    # last_edited_* — either too noisy or unrelated to event content.
    return []


def fetch_notion_page_properties(page_id: str, token: str) -> str:
    """Flatten the page's database properties to plain text. For
    database items, most canonical fields (date, price, capacity, tags)
    live here, not in the block tree, so without this the LLM gets
    only the body and misses everything in the columns."""
    page = _notion_request(f"/pages/{page_id}", token)
    properties = page.get("properties") or {}
    lines: list[str] = []
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue
        lines.extend(_property_to_lines(name, prop))
    return "\n".join(lines).strip()


def fetch_notion_page_text(page_id: str, token: str) -> str:
    """Returns a single flattened text representation of the page.

    Walks the block tree recursively. Caps the result at
    MAX_INGEST_TEXT_CHARS so an enormous page can't trigger an LLM
    bill spike — if the page exceeds the cap we keep the head + drop
    the rest, since events usually have the important stuff at the
    top (title, dates, location).
    """
    lines: list[str] = []
    stack: list[str] = [page_id]
    seen: set[str] = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        resp = _notion_request(f"/blocks/{current}/children?page_size=100", token)
        for block in resp.get("results", []):
            text = _block_to_text(block)
            if text:
                lines.append(text)
            if block.get("has_children"):
                child_id = block.get("id")
                if child_id:
                    stack.append(child_id)
        # Pagination — Notion returns `next_cursor` for long pages.
        cursor = resp.get("next_cursor")
        while cursor and len("\n".join(lines)) < MAX_INGEST_TEXT_CHARS:
            page = _notion_request(
                f"/blocks/{current}/children?page_size=100&start_cursor={cursor}",
                token,
            )
            for block in page.get("results", []):
                text = _block_to_text(block)
                if text:
                    lines.append(text)
                if block.get("has_children"):
                    child_id = block.get("id")
                    if child_id:
                        stack.append(child_id)
            cursor = page.get("next_cursor")

    flat = "\n".join(lines).strip()
    if len(flat) > MAX_INGEST_TEXT_CHARS:
        flat = flat[:MAX_INGEST_TEXT_CHARS] + "\n…[…]…\n"
    return flat


# ---------------------------------------------------------------------------
# 3. Claude extraction
# ---------------------------------------------------------------------------


EXTRACTION_SYSTEM_PROMPT = """\
You extract event metadata AND landing-page blocks from organiser notes
(Czech or English).

Return STRICT JSON matching this schema — no commentary, no markdown
code fences, no trailing text. Unknown fields → null. Dates as ISO 8601
with timezone offset assumed Europe/Prague. Numbers are JSON numbers,
not strings (except `price_amount` which is a numeric string so it
round-trips a DecimalField).

{
  "title": string | null,                   // short, no marketing fluff
  "description": string | null,             // 1-2 sentence summary
  "starts_at": "YYYY-MM-DDTHH:MM:SS+02:00" | null,
  "ends_at":   "YYYY-MM-DDTHH:MM:SS+02:00" | null,
  "location_text": string | null,
  "meeting_point_text": string | null,
  "location_url": string | null,            // Mapy.cz, Google Maps, etc.
  "capacity": integer | null,
  "price_amount": string | null,            // numeric string, e.g. "1850.00"
  "price_currency": "CZK" | "EUR" | null,
  "price_note": string | null,              // "Včetně ubytování a večeří"
  "notes": [string],                        // anything that didn't map to a field; max 10 items
  "blocks": [block]                         // ordered landing-page sections; [] when notes are too thin
}

Block shapes (each block is {id, type, payload}). `id` is a short
hyphenated string unique within the event; pick one from the section
header (e.g. "hero", "program", "v-cene", "pro-koho", "team", "faq").

{ "id": "hero", "type": "hero", "payload": {
    "cover_url": "",                     // leave empty — owner uploads later
    "eyebrow": "LETNÍ KEMP · BESKYDY · 2026",   // short label
    "title_override": string,                   // = title above
    "subtitle": string,                          // 1-2 sentences, sells the camp
    "cta_label": "Přihlásit se",
    "cta_href": "#registrace",
    "meta": [{"k": "TERMÍN", "v": "..."}, ...]  // 3-5 tiles
}}

{ "id": "about", "type": "prose", "payload": {
    "eyebrow": "O AKCI",
    "heading": "...",
    "body": "Multi-paragraph. \\n\\n splits paragraphs.",
    "image_url": "",
    "image_side": "right" | "left"
}}

{ "id": "stats", "type": "stats", "payload": {
    "dark": true,
    "tiles": [{"label": "DNY", "value": "4"}, ...]
}}

{ "id": "days", "type": "days", "payload": {
    "lead": "Tempo posouváme dle skupiny, kostra drží.",
    "days": [{
      "label": "ČTVRTEK", "num": "01", "title": "Příjezd, baseline",
      "route": "...", "body": "...", "time": "19:00-22:00",
      "distance": "3 km", "ascent": "+50 m", "descent": "",
      "image_url": "", "map_url": ""
    }, ...]
}}

{ "id": "pricing", "type": "included_split", "payload": {
    "price_value": "4 490", "price_unit": "Kč / osoba",
    "price_note": "Po naplnění registrace zavřeme.",
    "included":     [{"label": "Ubytování", "desc": "3 noci"}, ...],
    "not_included": [{"label": "Doprava",   "desc": "Spolujízdu pomůžeme zorganizovat"}, ...]
}}

{ "id": "audience", "type": "prose", "payload": {
    "eyebrow": "PRO KOHO", "heading": "...",
    "body": "Kemp je pro tebe, pokud:\\n\\n- ...",
    "image_url": "", "image_side": "right"
}}

{ "id": "team", "type": "prose", "payload": {
    "eyebrow": "TÝM", "heading": "Kdo tě bude provázet",
    "body": "**Olaf** — vede kemp...\\n\\n**Lachim** — kouč...",
    "image_url": "", "image_side": "left"
}}

{ "id": "faq", "type": "faq", "payload": {
    "eyebrow": "Praktické informace", "title": "Časté otázky",
    "items": [{"question": "...", "answer": "..."}, ...]
}}

Block rules:
- Pick block types that match the source content. If the notes only have
  basic fields (date, price, no program), return blocks: [].
- Always start blocks with "hero" when you produce any blocks at all.
- For multi-day programs, map each day-heading in the source to one
  entry in days[]. Don't merge days. `num` is a two-digit string ("01").
- For "Co je v ceně" / "Co není v ceně" sections, use included_split.
- For FAQ-style Q/A sections, use faq.
- For "Pro koho je akce" or "Kdo to vede", use prose with eyebrow
  "PRO KOHO" / "TÝM".
- Empty strings for image_url / map_url / cover_url — owner uploads
  later. Never invent URLs.
- Block bodies preserve the source's Czech voice (ty-form, no marketing
  fluff). Do NOT translate to English.

Field rules:
- If a single date is mentioned, treat it as the start; ends_at = same day 18:00.
- If the page uses 24-hour clock without explicit timezone, assume CEST/CET (Europe/Prague).
- Prefer the most prominent / first-mentioned values when in doubt.
- Never invent fields. If the text says nothing about price, return null.
"""


def _sanitize_blocks(blocks: Any) -> list[dict[str, Any]]:
    """Drop any block whose shape Claude got wrong instead of failing
    the whole ingest. The frontend renders what came back; the
    block-builder is open for the owner to add/fix missing ones.

    We do a soft validity check (matching block.id pattern + known type),
    not full payload validation — the user will hit blocks.py validators
    at save time, which gives them a precise error per block.
    """
    if not isinstance(blocks, list):
        return []
    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        block_id = block.get("id")
        payload = block.get("payload")
        if not isinstance(block_type, str) or not isinstance(block_id, str):
            continue
        if not isinstance(payload, dict):
            continue
        if not block_id.strip() or block_id in seen_ids:
            continue
        # Reject unknown types up front so frontend doesn't render
        # something the builder can't edit.
        from .blocks import KNOWN_BLOCK_TYPES

        if block_type not in KNOWN_BLOCK_TYPES:
            continue
        seen_ids.add(block_id)
        out.append({"id": block_id, "type": block_type, "payload": payload})
    return out


def extract_event_draft(page_text: str, anthropic_api_key: str) -> dict[str, Any]:
    """Send the page text to Claude, parse JSON response.

    Raises IngestError on transport failures or invalid JSON. The
    caller is responsible for mapping unknown fields to the Event
    form on the frontend — we don't try to validate every field
    here (that's the EventWriteSerializer's job once the user
    submits the draft for create).
    """
    if not anthropic_api_key:
        raise IngestError(
            "Anthropic API key není připojený. Otevři "
            "/settings/integrace a vlož svůj klíč.",
            status_code=400,
        )
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": MAX_ANTHROPIC_TOKENS_OUT,
        "system": EXTRACTION_SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": (
                    "Extract the event metadata from these organiser "
                    "notes:\n\n" + page_text
                ),
            }
        ],
    }
    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-api-key": anthropic_api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        snippet = e.read().decode("utf-8", errors="ignore")[:300]
        raise IngestError(
            f"Anthropic API vrátilo {e.code}: {snippet}",
            status_code=502,
        ) from e
    except urllib.error.URLError as e:
        raise IngestError(
            f"Anthropic API nedosažitelné: {e.reason}",
            status_code=502,
        ) from e

    # Claude wraps the assistant message in `content` as an array of
    # blocks; for a text-only reply the first block has `type=text`.
    blocks = data.get("content") or []
    if not blocks or blocks[0].get("type") != "text":
        raise IngestError(
            "Anthropic odpověď neobsahuje text — zkus to znovu.",
            status_code=502,
        )
    raw_text = blocks[0].get("text") or ""
    # Be lenient about stray markdown code fences in case the model
    # wraps the JSON despite instructions.
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        # Drop optional language tag.
        if cleaned.startswith("json"):
            cleaned = cleaned[len("json") :]
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise IngestError(
            "Claude nevrátil platný JSON — buď stránka neobsahuje "
            f"event metadata, nebo se model zmátl. ({e.msg})",
            status_code=502,
        ) from e
    if not isinstance(parsed, dict):
        raise IngestError(
            "Claude vrátil JSON, ale ne objekt.",
            status_code=502,
        )
    # Sanitize blocks in-place: drop malformed entries instead of failing
    # the whole ingest. Owner can fix gaps in the block builder.
    parsed["blocks"] = _sanitize_blocks(parsed.get("blocks"))
    return parsed


# ---------------------------------------------------------------------------
# 4. Orchestrator
# ---------------------------------------------------------------------------


def ingest_event_from_page_id(
    page_id: str,
    notion_token: str,
    anthropic_api_key: str,
) -> dict[str, Any]:
    """Same end-to-end pipeline as ingest_event_from_notion_url, but
    starts from a known 32-hex page id. Used by the sync endpoint that
    re-reads an event's bound Notion page without round-tripping
    through the URL."""
    # Pull both surfaces — properties (database columns) live on the
    # page object, body content lives in the block tree. Most organiser
    # databases stash date/price/capacity as columns; without the
    # properties stretch we'd only see whatever they typed into the
    # page body underneath the database row.
    props = fetch_notion_page_properties(page_id, notion_token)
    body = fetch_notion_page_text(page_id, notion_token)
    combined = "\n\n".join(part for part in (props, body) if part).strip()
    if not combined:
        raise IngestError(
            "Notion stránka je prázdná nebo neobsahuje text.",
            status_code=400,
        )
    draft = extract_event_draft(combined, anthropic_api_key)
    draft["notion_page_id"] = page_id
    return draft


def ingest_event_from_notion_url(
    url: str,
    notion_token: str,
    anthropic_api_key: str,
) -> dict[str, Any]:
    """End-to-end: URL → page text → Claude draft. Caller already
    decrypted both user-scoped tokens. Returns the parsed Claude
    response augmented with `source_url` so the frontend can stamp
    Event.source_url on the eventual create."""
    page_id = extract_notion_page_id(url)
    if not page_id:
        raise IngestError(
            "Z URL se nepodařilo vytáhnout Notion page ID.",
            status_code=400,
        )
    draft = ingest_event_from_page_id(page_id, notion_token, anthropic_api_key)
    draft["source_url"] = url
    return draft
