"""Import Ultra kalendář dataset (249 závodů sezóna 2027) do Race modelu.

Vstup: `apps/api/races/seed_data.json` (kompletní snapshot z
`hulinl/ultra-kalendar` reference projektu, `data/events.json`).

Idempotence: matcha podle `slug` (z JSON `id` fieldu, který je stabilní
per zdroj) → skip pokud už existuje, jinak vytvoří nový Race.
Nechceme přepisovat lokální edity, který admin může udělat po importu.
Pro force update použij `--overwrite`.

Datumy parseme z `date2027` stringu — pokud je „?", None nebo obsahuje
„TBA", fallbackneme na den 15 daného měsíce (`month` field) a uložíme
original string do `date_display` pro human display.

Series mapping:
- UTMB * → SERIES_UTMB
- World Trail Majors → SERIES_WTM
- Skyrunning → SERIES_SKY
- La Grande Course / ITRA / UTMB Major → SERIES_MAJOR
- vše ostatní (ČSUT, lidový, Nezávislý, etapový, …) → SERIES_INDEP
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from races.models import Race

SEED_PATH = Path(__file__).resolve().parent.parent.parent / "seed_data.json"

# Map JSON registration type → Race.REG_*
REG_MAP = {
    "V": Race.REG_OPEN,
    "L": Race.REG_LOTTERY,
    "S": Race.REG_SOLD_OUT,
    "Q": Race.REG_QUALIFIER,
    "K": Race.REG_CLOSED,
}

# Map JSON sport → Race.SPORT_*
SPORT_MAP = {
    "beh": Race.SPORT_TRAIL,
    "skialp": Race.SPORT_SKIALP,
}

# Map JSON terrain code → human string (pro filter chip UI)
TERRAIN_MAP = {
    "h": "hory",
    "t": "trail",
    "k": "lidový",
    "m": "maratonský",
    "e": "etapový",
    "s": "skialp",
    "z": "silniční / MTB",
}

# Map JSON region → Race.REGION_*
REGION_MAP = {
    "CZ": Race.REGION_CZ,
    "ALP": Race.REGION_ALP,
    "SKPL": Race.REGION_SKPL,
    "SEV": Race.REGION_SEV,
    "IBE": Race.REGION_IBE,
    "BAL": Race.REGION_BAL,
    "OST": Race.REGION_OST,
    "SVET": Race.REGION_SVET,
}


def _map_series(raw: str) -> str:
    """Map arbitrary JSON series string → Race SERIES_* choice."""
    if not raw:
        return Race.SERIES_INDEP
    lower = raw.lower()
    if "utmb major" in lower or "utmb finále" in lower or "utmb final" in lower:
        return Race.SERIES_UTMB
    if "utmb" in lower:
        return Race.SERIES_UTMB
    if "world trail majors" in lower or "wtm" in lower:
        return Race.SERIES_WTM
    if "skyrunning" in lower or "skyrunner" in lower or ("sky" in lower and "trail" not in lower):
        # „Skyrunning" ano; „Sky Running Ostrava" false positive risk
        return Race.SERIES_SKY
    if "la grande course" in lower or "grand course" in lower:
        return Race.SERIES_MAJOR
    if lower == "itra" or "itra pts" in lower:
        return Race.SERIES_MAJOR
    return Race.SERIES_INDEP


# --- Date parsing --------------------------------------------------------

# Range formát: "11.-12. 6." nebo "24.-30. 8." nebo "13.-19. 9. 2027".
# Pomlčka v datovém stringu je EN DASH (U+2013) nebo ASCII hyphen; regex
# matchne oba (character class obsahuje EN DASH záměrně, proto noqa).
_RE_RANGE_SAME_MONTH = re.compile(
    r"^\s*(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*$"  # noqa: RUF001
)
# Range pres mesice: "30. 8.-1. 9." (rare)
_RE_RANGE_DIFF_MONTH = re.compile(
    r"^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*$"  # noqa: RUF001
)
# Single day: "3. 4." nebo "3. 4. 2027"
_RE_SINGLE = re.compile(r"^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*$")


def _parse_date2027(
    raw: str | None, month_hint: int | None, default_year: int = 2027
) -> tuple[date, date | None, bool]:
    """Parse date2027 string. Returns (date_start, date_end_or_none, is_approx).

    Fallback: pokud raw je "?", None, "TBA", nebo neparsovatelný, použije
    den 15 daného month_hint. Rok se defaultuje na 2027.
    """
    fallback_month = month_hint or 1
    fallback_day = 15 if raw and "TBA" in raw and "konec" in raw.lower() else 15
    if raw is None or raw.strip() in {"?", ""} or "TBA" in raw.upper():
        # Přiblížený fallback — day 15 daného měsíce
        return date(default_year, fallback_month, fallback_day), None, True

    raw_clean = raw.replace("\xa0", " ").strip()

    # Range přes měsíce
    m = _RE_RANGE_DIFF_MONTH.match(raw_clean)
    if m:
        d1, m1, d2, m2, y = m.groups()
        y_int = int(y) if y else default_year
        return (
            date(y_int, int(m1), int(d1)),
            date(y_int, int(m2), int(d2)),
            False,
        )

    # Range stejný měsíc
    m = _RE_RANGE_SAME_MONTH.match(raw_clean)
    if m:
        d1, d2, mo, y = m.groups()
        y_int = int(y) if y else default_year
        return (
            date(y_int, int(mo), int(d1)),
            date(y_int, int(mo), int(d2)),
            False,
        )

    # Single day
    m = _RE_SINGLE.match(raw_clean)
    if m:
        d1, mo, y = m.groups()
        y_int = int(y) if y else default_year
        return date(y_int, int(mo), int(d1)), None, False

    # Fallback pro cokoli jiného (např. „konec srpna (TBA)")
    return date(default_year, fallback_month, fallback_day), None, True


class Command(BaseCommand):
    help = "Import Ultra kalendář dataset (249 závodů) do Race modelu."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Přepíše existující Race s totožným slugem (jinak skip).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Nic nezapíše, jen ukáže co by se dělo.",
        )

    def handle(self, *args, **options) -> None:
        overwrite = options["overwrite"]
        dry_run = options["dry_run"]

        if not SEED_PATH.exists():
            self.stderr.write(f"Seed data nenalezena: {SEED_PATH}")
            return

        with open(SEED_PATH, encoding="utf-8") as f:
            payload = json.load(f)
        events = payload.get("events", [])
        self.stdout.write(f"Načteno {len(events)} závodů z seed_data.json")

        created = 0
        updated = 0
        skipped = 0
        approx = 0

        with transaction.atomic():
            for e in events:
                slug = e.get("id")
                if not slug:
                    skipped += 1
                    continue

                existing = Race.objects.filter(slug=slug).first()
                if existing and not overwrite:
                    skipped += 1
                    continue

                date_raw = e.get("date2027")
                d_start, d_end, is_approx = _parse_date2027(
                    date_raw, e.get("month")
                )
                if is_approx:
                    approx += 1

                distances_note = e.get("distances") or ""
                km = e.get("km") or 0
                # Některé skialp events mají km=0 / None. Přeskočíme s
                # 0 (positive int check by failed), nastavíme na 1
                # jako placeholder.
                if not km or km < 1:
                    km = 1

                fields = {
                    "name": e.get("name", "").strip(),
                    "date_start": d_start,
                    "date_end": d_end,
                    "date_display": (date_raw or "").strip() if date_raw else "",
                    "distance_km": int(round(km)),
                    "distances_note": distances_note[:200],
                    "elevation_m": e.get("dplus") or None,
                    "terrain": TERRAIN_MAP.get(e.get("terrain", ""), ""),
                    "sport": SPORT_MAP.get(e.get("sport", "beh"), Race.SPORT_TRAIL),
                    "location": (e.get("place") or "").strip()[:200],
                    "country": (e.get("country") or "").strip()[:200],
                    "region": REGION_MAP.get(e.get("region", ""), ""),
                    "url": e.get("web") or "",
                    "series": _map_series(e.get("series", "")),
                    "registration_status": REG_MAP.get(
                        (e.get("registration") or {}).get("type", "V"),
                        Race.REG_OPEN,
                    ),
                    "highlight": (e.get("highlight") or "")[:280],
                    "is_visible": True,
                }

                if dry_run:
                    self.stdout.write(
                        f"  [dry] {slug}: {fields['name']} ({d_start})"
                    )
                    continue

                if existing:
                    for k, v in fields.items():
                        setattr(existing, k, v)
                    existing.slug = slug
                    existing.save()
                    updated += 1
                else:
                    race = Race(slug=slug, **fields)
                    race.save()
                    created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"import_ultra_events: vytvořeno {created}, přepsáno "
                f"{updated}, přeskočeno {skipped}, "
                f"z toho {approx} má přiblížené datum (TBA)."
            )
        )
