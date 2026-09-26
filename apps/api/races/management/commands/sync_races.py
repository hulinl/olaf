"""Daily agent — re-syncuje race records ze seed_data.json snapshotu.

Uploadovaný snapshot je zdroj pravdy (odpovídá referenci
`hulinl/ultra-kalendar` výstupu). Command:
- Re-mapa registration.type + detail + top + warn + next.label/year
- Po přidání nové entry (nový slug v seed) tu doda do DB
- Existující entries updatuje jen když data reference se změnila
  (nechceme přepsat admin edity typu is_visible=False nebo custom
  highlight text)

Idempotentní. Spouštěno jednou denně přes Celery beat (viz
`races.tasks.sync_races_task`). Ručně:
    python manage.py sync_races
    python manage.py sync_races --dry-run
    python manage.py sync_races --force  # přepíše i admin edity

Verzí V2 rozšířit o remote fetch (GitHub raw URL nebo scraper).
"""
from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from races.models import Race

SEED_PATH = Path(__file__).resolve().parent.parent.parent / "seed_data.json"

TYPE_MAP = {
    "V": Race.REG_OPEN,
    "L": Race.REG_LOTTERY,
    "S": Race.REG_SOLD_OUT,
    "K": Race.REG_CLOSED,
    "Q": Race.REG_UNKNOWN,
}
SPORT_MAP = {"beh": Race.SPORT_TRAIL, "skialp": Race.SPORT_SKIALP}
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
TERRAIN_MAP = {
    "h": "hory",
    "t": "trail",
    "k": "lidový",
    "m": "maratonský",
    "e": "etapový",
    "s": "skialp",
    "z": "silniční / MTB",
}


def _map_series(raw: str) -> str:
    if not raw:
        return Race.SERIES_INDEP
    lower = raw.lower()
    if "utmb" in lower:
        return Race.SERIES_UTMB
    if "world trail majors" in lower or "wtm" in lower:
        return Race.SERIES_WTM
    if "skyrunning" in lower or "skyrunner" in lower:
        return Race.SERIES_SKY
    if "la grande course" in lower or "grand course" in lower:
        return Race.SERIES_MAJOR
    if lower == "itra" or "itra pts" in lower:
        return Race.SERIES_MAJOR
    return Race.SERIES_INDEP


class Command(BaseCommand):
    help = "Sync race records ze seed_data.json (daily agent)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument(
            "--force",
            action="store_true",
            help="Přepíše i admin edity (is_visible, custom highlight).",
        )

    def handle(self, *args, **options) -> None:
        dry = options["dry_run"]
        force = options["force"]

        if not SEED_PATH.exists():
            self.stderr.write(f"seed_data.json nenalezen: {SEED_PATH}")
            return

        with open(SEED_PATH, encoding="utf-8") as f:
            events = json.load(f).get("events", [])

        created = updated = unchanged = 0
        with transaction.atomic():
            for e in events:
                slug = e.get("id")
                if not slug:
                    continue

                fields = self._extract_fields(e)
                existing = Race.objects.filter(slug=slug).first()

                if existing:
                    changed = self._apply_updates(existing, fields, force=force)
                    if changed:
                        if not dry:
                            existing.save()
                        updated += 1
                    else:
                        unchanged += 1
                else:
                    if not dry:
                        Race.objects.create(slug=slug, **fields)
                    created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"sync_races: +{created} nových, ~{updated} updatů, "
                f"={unchanged} beze změny"
                + (" [DRY]" if dry else "")
            )
        )

    def _extract_fields(self, e: dict) -> dict:
        km = e.get("km") or 0
        if not km or km < 1:
            km = 1
        return {
            "name": (e.get("name") or "").strip()[:200],
            "distance_km": int(round(km)),
            "distances_note": (e.get("distances") or "")[:200],
            "elevation_m": e.get("dplus") or None,
            "terrain": TERRAIN_MAP.get(e.get("terrain", ""), ""),
            "sport": SPORT_MAP.get(e.get("sport", "beh"), Race.SPORT_TRAIL),
            "location": (e.get("place") or "").strip()[:200],
            "country": (e.get("country") or "").strip()[:200],
            "region": REGION_MAP.get(e.get("region", ""), ""),
            "url": e.get("web") or "",
            "series": _map_series(e.get("series", "")),
            "registration_status": TYPE_MAP.get(
                (e.get("registration") or {}).get("type", "V"), Race.REG_OPEN
            ),
            "registration_detail": (
                (e.get("registration") or {}).get("detail", "") or ""
            )[:2000],
            "highlight": (e.get("highlight") or "")[:280],
            "is_top": bool(e.get("top", False)),
            "has_warning": bool(e.get("warn", False)),
            "next_label": ((e.get("next") or {}).get("label") or "")[:100],
            "next_year": int(
                (e.get("next") or {}).get("year") or 2027
            ),
        }

    def _apply_updates(self, race: Race, fields: dict, *, force: bool) -> bool:
        """Aplikuje pole na race, vrací True pokud se něco změnilo.
        Admin-editovatelná pole (is_visible, highlight) preservuje pokud
        se admin dotkl (updated_at > created_at) — leda force=True."""
        admin_touched = race.updated_at > race.created_at
        skip_fields = set()
        if admin_touched and not force:
            skip_fields = {"highlight"}  # pouze uživatelské pole

        changed = False
        for key, new_val in fields.items():
            if key in skip_fields:
                continue
            old_val = getattr(race, key)
            if old_val != new_val:
                setattr(race, key, new_val)
                changed = True
        return changed
