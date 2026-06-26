"""Sync ContractTemplate.body_html z Notion stránky.

Reuse pipeline z `events.notion_ingest`:
1. Extract Notion page ID z URL.
2. Fetch page text přes Notion API (potřeba user.notion_token).
3. Pošle text Claudovi (user.anthropic_api_key) s instrukcí
   „vytáhni z toho text smlouvy ve formě HTML, vynech meta,
   zachovej nadpisy + odstavce + listy".
4. Result je clean HTML — uložíme do `template.body_html`.

Owner pak v aplikaci dál upraví (přidá placeholdery, odstraní
nepotřebné odstavce, atd.) a uloží.
"""
from __future__ import annotations

import json
from typing import Any

import requests

from events.notion_ingest import (
    ANTHROPIC_API_URL,
    ANTHROPIC_VERSION,
    IngestError,
    extract_notion_page_id,
    fetch_notion_page_text,
)

CLAUDE_MODEL = "claude-sonnet-4-6"

CONTRACT_SYSTEM_PROMPT = """Jsi asistent, který převádí Notion stránku
s textem smlouvy do clean HTML. Tvůj output je validní HTML fragment
určený pro vložení do dalšího HTML dokumentu (žádný <html>, <head>,
<body>, žádné style atributy, jen sémantické tagy: <h2>, <h3>, <p>,
<ul>, <ol>, <li>, <strong>, <em>, <br>).

Pravidla:
- Zachovej strukturu nadpisů (Heading 1 → <h2>, Heading 2 → <h3>).
- Odstavce vrať jako <p>.
- Listy zachovej jako <ul>/<ol> s <li>.
- Vynech meta řádky typu „Vytvořeno", „Autor", „Tags" — to nepatří
  do smlouvy.
- Pokud najdeš placeholdery jako {{jmeno}}, {{datum}}, {{email}},
  zachovej je beze změny — později se vyplní z dat účastníka.
- Nepřidávej žádný vlastní text, jen čisti, co tam je.
- Vrať pouze HTML fragment, nic jiného (žádné ```html, žádný
  komentář).
"""


def html_from_notion_text(text: str, anthropic_api_key: str) -> str:
    """Pošle Notion page text Claudovi, vrátí clean HTML fragment."""
    if not anthropic_api_key:
        raise IngestError("Chybí Anthropic API key.", code="anthropic")

    body = {
        "model": CLAUDE_MODEL,
        "max_tokens": 4096,
        "system": CONTRACT_SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": f"Notion stránka:\n\n{text}\n\n"
                "Vrať smlouvu jako clean HTML fragment.",
            }
        ],
    }

    response = requests.post(
        ANTHROPIC_API_URL,
        headers={
            "x-api-key": anthropic_api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
        data=json.dumps(body),
        timeout=60,
    )
    if response.status_code != 200:
        raise IngestError(
            f"Anthropic API vrátilo {response.status_code}.",
            code="anthropic",
        )
    payload = response.json()
    parts = payload.get("content", [])
    if not parts or "text" not in parts[0]:
        raise IngestError(
            "Anthropic vrátilo prázdnou odpověď.", code="anthropic"
        )
    text_out = parts[0]["text"].strip()
    # Pokud Claude vrátí ```html ... ``` blok, odstraň ho.
    if text_out.startswith("```"):
        # Strip první line + poslední line.
        lines = text_out.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text_out = "\n".join(lines).strip()
    return text_out


def sync_template_from_notion_url(
    *,
    notion_url: str,
    notion_token: str,
    anthropic_api_key: str,
) -> dict[str, Any]:
    """Pipeline: URL → page_id → page_text → Claude HTML → vrať dict."""
    page_id = extract_notion_page_id(notion_url)
    if not page_id:
        raise IngestError("Neplatný Notion URL.", code="notion")
    if not notion_token:
        raise IngestError("Chybí Notion API token.", code="notion")

    # `fetch_notion_page_text` vrací (text, diagnostics) tuple — bug
    # z PR #230 byl, že jsem to ukládal jako string a Claude pak
    # dostal repr tuple-u místo skutečného textu. Teď unpack-uji.
    page_text, _diag = fetch_notion_page_text(page_id, notion_token)
    body_html = html_from_notion_text(page_text, anthropic_api_key)
    return {"body_html": body_html}
