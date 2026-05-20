"""Backfill random slugs on existing GearList rows.

The slug field was added in 0002 with blank=True so existing rows
still have empty slugs. Generate one per row using the same scheme
as the model's save() override, but inline so we don't reach across
into model code (migrations should be reversible from any point).
"""
from __future__ import annotations

import secrets

from django.db import migrations


def backfill(apps, schema_editor):
    GearList = apps.get_model("gear", "GearList")
    existing = set(
        GearList.objects.exclude(slug="").values_list("slug", flat=True)
    )
    for row in GearList.objects.filter(slug=""):
        for _ in range(8):
            candidate = secrets.token_urlsafe(12)[:16]
            if candidate not in existing:
                existing.add(candidate)
                row.slug = candidate
                row.save(update_fields=["slug"])
                break


def unbackfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("gear", "0002_gearlist_slug_gearlist_visibility"),
    ]

    operations = [migrations.RunPython(backfill, unbackfill)]
