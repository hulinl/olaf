"""AI-powered race URL extraction — „Chybí tu závod?" flow.

Fetch race webpage → strip do textu → pošli Claudovi s explicit JSON
schema prompt → parse JSON → save jako RaceSubmission (status=pending).

Fallback logic: pokud AI vrátí neparsable JSON, uložíme raw response
do `ai_response_raw` a status=pending s prázdným extracted_data —
admin může doplnit manuálně.
"""
from __future__ import annotations

import contextlib
import json
import re
import urllib.error
import urllib.request

import requests
from django.conf import settings

# Reuse SSRF guard z personal_calendar — stejná security surface.
from personal_calendar.services import (
    ICalFetchError,
    _validate_url_target,
)

MAX_FETCH_BYTES = 5 * 1024 * 1024  # 5 MB — race webpages jsou obvykle < 500 KB
FETCH_TIMEOUT = 15
# Max chars text pro Claude — ochrana proti obřím stránkám a token bill.
MAX_TEXT_CHARS = 20_000

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

EXTRACT_SYSTEM = """Jsi assistent, který extrahuje strukturovaná data z webové \
stránky ultra závodu / horského maratonu / trailu. Vrať POUZE validní JSON \
podle schema — žádný markdown, žádné vysvětlení, jen JSON."""

EXTRACT_USER_TEMPLATE = """Extrahuj z této stránky race údaje. Pokud pole \
neexistuje na stránce, vrať null. Neuhaduj — když nejsi jistý, radši null.

**Schema:**
```json
{{
  "name": "Oficiální název závodu (string, max 200)",
  "distance_km": "Hlavní distance v km, integer, zaokrouhli nahoru (např. 42, 168)",
  "elevation_m": "Celkové D+ v metrech, integer nebo null (např. 6200)",
  "sport": "'trail' pro běh nebo 'skialp' pro skialp",
  "region": "'CZ' | 'SK' | 'PL' | 'ALP' (Alpy) | 'SEV' (Skandinávie) | 'IBE' (Ibérie) | 'BAL' (Balkán) | 'OST' (Ostrovy) | 'SVET' (jinde). Vyber best-fit.",
  "country": "Země v češtině (Francie, Španělsko, Česko, Švýcarsko, ...)",
  "place": "Startovní město / lokalita (Chamonix, Zermatt, ...)",
  "month": "Měsíc konání jako číslo 1-12",
  "year": "Rok příštího/aktuálního ročníku (integer, např. 2027)",
  "day": "Den konání jako číslo 1-31 pokud je uveden, jinak null",
  "series": "'utmb' | 'wtm' | 'sky' | 'major' | 'indep'. Default 'indep'.",
  "terrain": "'trail' | 'mountain' | 'road' | 'skyrace'",
  "registration_type": "'V' (Volně) | 'L' (Loterie) | 'S' (Sold-out) | 'K' (Kvalifikace) | 'Z' (Uzavřeno) | 'N' (Nejasné). Default 'N'.",
  "registration_detail": "1-2 věty jak funguje přihlašování (loterie, kvalifikace, first-come, atd.), max 200 chars",
  "highlight": "1-2 věty čím je závod zajímavý — atmosférická charakteristika (max 280 chars)",
  "distances_note": "String s alternativními délkami pokud jsou (např. '42 / 88 / 174'), jinak null"
}}
```

**Stránka:**
URL: {url}

Text:
{text}
"""


class ExtractionError(Exception):
    """User-facing chyba s CZ zprávou."""


def fetch_url_text(url: str) -> str:
    """Fetch URL, strip HTML, vrátí plain text (max MAX_TEXT_CHARS chars)."""
    try:
        _validate_url_target(url)
    except ICalFetchError as exc:
        raise ExtractionError(str(exc)) from exc

    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "olaf-events/1.0 (+https://olaf.events; race-submission)"
                ),
                "Accept": "text/html,application/xhtml+xml,text/plain",
            },
        )
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            raw = resp.read(MAX_FETCH_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ExtractionError(f"Nepodařilo se stáhnout URL: {exc}") from exc

    if len(raw) > MAX_FETCH_BYTES:
        raise ExtractionError(
            f"Stránka je moc velká (>{MAX_FETCH_BYTES // 1024 // 1024} MB)."
        )

    # Decode s tolerancí k charset chybám
    text = raw.decode("utf-8", errors="ignore")

    # Strip HTML — jednoduchý regex approach. Ne 100% robustní, ale pro
    # race webpages (většinou obsah je v obyčejných textových blocích)
    # OK a bez další deps. Pokud budou problémy, přejdi na beautifulsoup4.
    text = re.sub(r"<script\b[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style\b[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text[:MAX_TEXT_CHARS]


def call_anthropic(prompt_text: str) -> str:
    """Zavolá Claude s prompt textem, vrátí response content string.
    Používá system-level ANTHROPIC_API_KEY z settings.
    """
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ExtractionError(
            "AI extract je vypnutý na tomto serveru "
            "(ANTHROPIC_API_KEY není nastaven)."
        )

    model = getattr(settings, "ANTHROPIC_INGEST_MODEL", "claude-haiku-4-5")
    try:
        resp = requests.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 2000,
                "system": EXTRACT_SYSTEM,
                "messages": [
                    {"role": "user", "content": prompt_text},
                ],
            },
            timeout=60,
        )
    except requests.RequestException as exc:
        raise ExtractionError(
            f"AI API selhalo: {exc}"
        ) from exc

    if resp.status_code != 200:
        raise ExtractionError(
            f"AI API vrátilo {resp.status_code}: {resp.text[:200]}"
        )

    body = resp.json()
    content = body.get("content") or []
    if not content:
        raise ExtractionError("AI vrátilo prázdnou odpověď.")
    parts = [
        p.get("text", "") for p in content if p.get("type") == "text"
    ]
    return "\n".join(parts)


def parse_ai_response(text: str) -> dict:
    """Best-effort parse JSON z Claude response.

    Claude občas obalí JSON do ```json blocků nebo přidá krátký prefix.
    Robustní parse: najdi první `{` a poslední `}`, sliš, parse.
    """
    if not text.strip():
        return {}
    # Strip markdown code fence
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text)
    # Find outer JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    candidate = text[start : end + 1]
    with contextlib.suppress(json.JSONDecodeError):
        return json.loads(candidate)
    return {}


def extract_race_from_url(url: str) -> tuple[dict, str]:
    """Full pipeline: fetch → text → AI → JSON parse.

    Returns (extracted_dict, raw_ai_response).
    Raises ExtractionError s user-friendly CZ zprávou.
    """
    text = fetch_url_text(url)
    if not text:
        raise ExtractionError("Stránka je prázdná / bez textového obsahu.")
    prompt = EXTRACT_USER_TEMPLATE.format(url=url, text=text)
    ai_raw = call_anthropic(prompt)
    parsed = parse_ai_response(ai_raw)
    return parsed, ai_raw


def race_from_submission_data(data: dict, source_url: str) -> dict:
    """Převede AI extract dict na kwargy pro `Race.objects.create()`.

    Sanitize + normalizace: distance min 1 km, region mapping,
    date_start z year+month+day s clampem.
    """
    from datetime import date

    from .models import Race

    REGION_MAP = {
        "CZ": Race.REGION_CZ,
        "SK": Race.REGION_SK,
        "PL": Race.REGION_PL,
        "ALP": Race.REGION_ALP,
        "SEV": Race.REGION_SEV,
        "IBE": Race.REGION_IBE,
        "BAL": Race.REGION_BAL,
        "OST": Race.REGION_OST,
        "SVET": Race.REGION_SVET,
    }
    SPORT_MAP = {
        "trail": Race.SPORT_TRAIL,
        "skialp": Race.SPORT_SKIALP,
    }
    SERIES_MAP = {
        "utmb": Race.SERIES_UTMB,
        "wtm": Race.SERIES_WTM,
        "sky": Race.SERIES_SKY,
        "major": Race.SERIES_MAJOR,
        "indep": Race.SERIES_INDEP,
    }
    REG_MAP = {
        "V": Race.REG_OPEN,
        "L": Race.REG_LOTTERY,
        "S": Race.REG_SOLD_OUT,
        "K": Race.REG_QUALIFIER,
        "Z": Race.REG_CLOSED,
        "N": Race.REG_UNKNOWN,
    }

    km = max(1, int(data.get("distance_km") or 1))
    year = int(data.get("year") or 2027)
    month = int(data.get("month") or 1)
    day = data.get("day")
    if day is None or not isinstance(day, int) or day < 1 or day > 31:
        day = 1

    import calendar

    max_day = calendar.monthrange(year, month)[1]
    day = min(day, max_day)
    try:
        date_start = date(year, month, day)
    except ValueError:
        date_start = date(year, 1, 1)

    return {
        "name": (data.get("name") or "").strip()[:200] or "Neznámý závod",
        "date_start": date_start,
        "distance_km": km,
        "distances_note": (data.get("distances_note") or "")[:200] or "",
        "elevation_m": data.get("elevation_m") or None,
        "terrain": (data.get("terrain") or "")[:60],
        "sport": SPORT_MAP.get(data.get("sport"), Race.SPORT_TRAIL),
        "location": (data.get("place") or "")[:200],
        "country": (data.get("country") or "")[:200],
        "region": REGION_MAP.get(data.get("region"), ""),
        "url": (data.get("url") or source_url or "")[:500],
        "series": SERIES_MAP.get(data.get("series"), Race.SERIES_INDEP),
        "registration_status": REG_MAP.get(
            data.get("registration_type"), Race.REG_UNKNOWN
        ),
        "registration_detail": (
            data.get("registration_detail") or ""
        )[:2000],
        "highlight": (data.get("highlight") or "")[:280],
        "next_year": year,
        "next_label": data.get("next_label") or "",
    }
