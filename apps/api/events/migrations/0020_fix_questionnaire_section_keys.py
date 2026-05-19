"""Fix corrupted enabled_questionnaire_sections from migration 0019.

Migration 0019 backfilled empty arrays with Czech section keys
("kondice", "vykonnost", …) that don't exist in the backend's
SECTION_FIELDS map (which uses English: tshirt_size, diet, fitness,
health_notes, emergency_contact, photo_consent). The result: any
event with the backfilled list couldn't be saved — the serializer
bounced PATCH with "Neznámá sekce: [...]".

This migration sweeps every event and rewrites its sections list,
keeping only entries that exist in the canonical set. Anything else
(including any leftover Czech keys from 0019) is dropped. If that
leaves the list empty, we fill it with the full canonical set —
which is what 0019 was *meant* to do.
"""
from __future__ import annotations

from django.db import migrations


# Canonical keys mirroring events.models.Event.QUESTIONNAIRE_SECTIONS_ALL.
CANONICAL = [
    "tshirt_size",
    "diet",
    "fitness",
    "health_notes",
    "emergency_contact",
    "photo_consent",
]
CANONICAL_SET = set(CANONICAL)

# Best-effort remap so we don't lose owner intent for events that
# only had the legacy Czech keys after 0019. The Czech names map
# 1:1 to the English canonical names.
CZECH_TO_CANONICAL = {
    "kondice": "fitness",
    "vykonnost": "fitness",
    "strava": "diet",
    "alergie": "diet",
    "zdravotni_poznamky": "health_notes",
    "tisnovy_kontakt": "emergency_contact",
    "souhlas_s_fotem": "photo_consent",
}


def fix(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    for event in Event.objects.iterator():
        raw = event.enabled_questionnaire_sections or []
        cleaned: list[str] = []
        for key in raw:
            if key in CANONICAL_SET:
                if key not in cleaned:
                    cleaned.append(key)
                continue
            mapped = CZECH_TO_CANONICAL.get(key)
            if mapped and mapped not in cleaned:
                cleaned.append(mapped)
        # If the row was the all-Czech backfill from 0019, mapping
        # will have produced "fitness, diet, health_notes,
        # emergency_contact, photo_consent" — missing tshirt_size.
        # Fall back to the full canonical set in that case, matching
        # the original "empty = everything on" intent.
        if not cleaned:
            cleaned = list(CANONICAL)
        if cleaned != raw:
            event.enabled_questionnaire_sections = cleaned
            event.save(update_fields=["enabled_questionnaire_sections"])


def unfix(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0019_seed_questionnaire_sections"),
    ]

    operations = [migrations.RunPython(fix, unfix)]
