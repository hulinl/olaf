"""Data migration — importuje 249 závodů z seed_data.json do Race
tabulky. Idempotentní: pokud race se stejným slugem už existuje,
nechává ho beze změny (respektuje admin edity po importu).

Tato migrace nahrazuje potřebu volat `python manage.py import_ultra_events`
ručně na prod — entrypoint.sh spouští migrate na každém deployi, takže
seed data se automaticky propíšou do prod DB při první instalaci
migrace 0003.

Pro budoucí re-import (např. po update dat) použij management command
`import_ultra_events --overwrite`, nebo napiš novou datovou migraci.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from django.db import migrations


SEED_PATH = Path(__file__).resolve().parent.parent / "seed_data.json"


# Regex patterns pro parsing date2027 stringu (single day / same-month
# range / cross-month range). En dash v [–-] je záměrný — dataset ho
# používá pro rozsahy.
_RE_RANGE_SAME_MONTH = re.compile(
    r"^\s*(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*$"  # noqa: RUF001
)
_RE_RANGE_DIFF_MONTH = re.compile(
    r"^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*$"  # noqa: RUF001
)
_RE_SINGLE = re.compile(r"^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*$")


def _parse_date(raw, month_hint, default_year=2027):
    fallback_month = month_hint or 1
    if raw is None or (raw or "").strip() in {"?", ""} or "TBA" in (raw or "").upper():
        return date(default_year, fallback_month, 15), None, True
    raw_clean = raw.replace("\xa0", " ").strip()
    m = _RE_RANGE_DIFF_MONTH.match(raw_clean)
    if m:
        d1, m1, d2, m2, y = m.groups()
        y_int = int(y) if y else default_year
        return date(y_int, int(m1), int(d1)), date(y_int, int(m2), int(d2)), False
    m = _RE_RANGE_SAME_MONTH.match(raw_clean)
    if m:
        d1, d2, mo, y = m.groups()
        y_int = int(y) if y else default_year
        return date(y_int, int(mo), int(d1)), date(y_int, int(mo), int(d2)), False
    m = _RE_SINGLE.match(raw_clean)
    if m:
        d1, mo, y = m.groups()
        y_int = int(y) if y else default_year
        return date(y_int, int(mo), int(d1)), None, False
    return date(default_year, fallback_month, 15), None, True


def _map_series(raw):
    """Vrací string konstantu odpovídající Race.SERIES_* choices.
    Data migration nesmí importovat Race model, jinak by mohla přestat
    fungovat po přejmenování modelu v budoucnu — proto stringové
    literály."""
    if not raw:
        return "indep"
    lower = raw.lower()
    if "utmb" in lower:
        return "utmb"
    if "world trail majors" in lower or "wtm" in lower:
        return "wtm"
    if "skyrunning" in lower or "skyrunner" in lower:
        return "sky"
    if ("sky" in lower and "trail" not in lower and "skialp" not in lower):
        return "sky"
    if "la grande course" in lower or "grand course" in lower:
        return "major"
    if lower == "itra" or "itra pts" in lower:
        return "major"
    return "indep"


REG_MAP = {
    "V": "open",
    "L": "lottery",
    "S": "sold_out",
    "Q": "qualifier",
    "K": "closed",
}
SPORT_MAP = {"beh": "trail", "skialp": "skialp"}
TERRAIN_MAP = {
    "h": "hory",
    "t": "trail",
    "k": "lidový",
    "m": "maratonský",
    "e": "etapový",
    "s": "skialp",
    "z": "silniční / MTB",
}
REGION_MAP = {
    "CZ": "CZ",
    "ALP": "ALP",
    "SKPL": "SKPL",
    "SEV": "SEV",
    "IBE": "IBE",
    "BAL": "BAL",
    "OST": "OST",
    "SVET": "SVET",
}


def import_races(apps, schema_editor):
    Race = apps.get_model("races", "Race")

    if not SEED_PATH.exists():
        # Local dev bez seed_data.json — no-op, migrace prochází bez erroru.
        return

    with open(SEED_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    events = payload.get("events", [])

    to_create = []
    for e in events:
        slug = e.get("id")
        if not slug:
            continue
        # Idempotence — už existuje? Skip. Admin může mít edity, které
        # nechceme přepsat automaticky.
        if Race.objects.filter(slug=slug).exists():
            continue

        date_raw = e.get("date2027")
        d_start, d_end, _is_approx = _parse_date(date_raw, e.get("month"))
        km = e.get("km") or 0
        if not km or km < 1:
            km = 1

        to_create.append(
            Race(
                slug=slug,
                name=(e.get("name") or "").strip()[:200],
                date_start=d_start,
                date_end=d_end,
                date_display=(date_raw or "").strip() if date_raw else "",
                distance_km=int(round(km)),
                distances_note=(e.get("distances") or "")[:200],
                elevation_m=e.get("dplus") or None,
                terrain=TERRAIN_MAP.get(e.get("terrain", ""), ""),
                sport=SPORT_MAP.get(e.get("sport", "beh"), "trail"),
                location=(e.get("place") or "").strip()[:200],
                country=(e.get("country") or "").strip()[:200],
                region=REGION_MAP.get(e.get("region", ""), ""),
                url=e.get("web") or "",
                series=_map_series(e.get("series", "")),
                registration_status=REG_MAP.get(
                    (e.get("registration") or {}).get("type", "V"), "open"
                ),
                highlight=(e.get("highlight") or "")[:280],
                is_visible=True,
            )
        )

    if to_create:
        Race.objects.bulk_create(to_create, batch_size=100)


def reverse_import(apps, schema_editor):
    """Rollback — smaže závody, které pocházely z tohoto importu
    (identifikované podle seznamu slugs v seed_data.json). Zachovává
    ručně vytvořené závody s jinými slugy."""
    Race = apps.get_model("races", "Race")
    if not SEED_PATH.exists():
        return
    with open(SEED_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    slugs = [e.get("id") for e in payload.get("events", []) if e.get("id")]
    if slugs:
        Race.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("races", "0002_enrich_from_ultra_dataset"),
    ]

    operations = [
        migrations.RunPython(import_races, reverse_import),
    ]
