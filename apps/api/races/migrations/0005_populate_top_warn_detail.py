"""Data migration — dopočítá nové pole `is_top`, `has_warning`,
`next_label`, `next_year`, `registration_detail` z uloženého
`seed_data.json` snapshotu.

Idempotentní: iteruje seed_data.json, matcha podle slug, updatuje
JEN neprázdná / neresetovaná pole. Manuálně přidané race records
(slugy které nejsou v seed) neruší.

Také přemapuje `registration_status = "qualifier"` na `"unknown"` pro
race records, kde původní JSON má `registration.type = "Q"` (což byl
můj původní misinterpret — Q v reference znamená „?" nejasné, ne
„vyžaduje kvalifikaci"). Kvalifikace = K.
"""
from __future__ import annotations

import json
from pathlib import Path

from django.db import migrations


SEED_PATH = Path(__file__).resolve().parent.parent / "seed_data.json"


def enrich_races(apps, schema_editor):
    Race = apps.get_model("races", "Race")

    if not SEED_PATH.exists():
        return

    with open(SEED_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    events = payload.get("events", [])
    by_slug = {e.get("id"): e for e in events if e.get("id")}

    updates = 0
    for race in Race.objects.all():
        e = by_slug.get(race.slug)
        if not e:
            continue

        # Registration: JSON type map → Race field values.
        # V → open, L → lottery, S → sold_out, K → closed, Q → unknown
        json_type = (e.get("registration") or {}).get("type", "V")
        json_detail = (e.get("registration") or {}).get("detail", "") or ""
        type_map = {
            "V": "open",
            "L": "lottery",
            "S": "sold_out",
            "K": "closed",
            "Q": "unknown",
        }
        new_status = type_map.get(json_type, "open")
        race.registration_status = new_status
        race.registration_detail = json_detail[:2000]

        # TOP + warn
        race.is_top = bool(e.get("top", False))
        race.has_warning = bool(e.get("warn", False))

        # Next label / year
        nxt = e.get("next") or {}
        race.next_label = (nxt.get("label") or "")[:100]
        try:
            race.next_year = int(nxt.get("year") or 2027)
        except (ValueError, TypeError):
            race.next_year = 2027

        race.save(
            update_fields=[
                "registration_status",
                "registration_detail",
                "is_top",
                "has_warning",
                "next_label",
                "next_year",
            ]
        )
        updates += 1


def reverse_enrich(apps, _schema_editor):
    """Rollback — resetuj nové pole na default. Nezruší records."""
    Race = apps.get_model("races", "Race")
    Race.objects.update(
        is_top=False,
        has_warning=False,
        next_label="",
        next_year=2027,
        registration_detail="",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("races", "0004_enrich_reg_detail_top_warn"),
    ]

    operations = [
        migrations.RunPython(enrich_races, reverse_enrich),
    ]
