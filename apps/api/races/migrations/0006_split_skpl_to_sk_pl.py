"""Data migration — SKPL region split na SK a PL podle country fieldu.

Reference data pokládá Slovensko + Polsko do jednoho bucketu, ale user
chce oddělený filter per stát. Split logic:
- country obsahuje „Polsk"/„Poland" → PL
- ostatní (Slovensko + edge cases) → SK
"""
from __future__ import annotations

from django.db import migrations, models


def split_skpl(apps, _schema_editor):
    Race = apps.get_model("races", "Race")
    to_split = Race.objects.filter(region="SKPL")
    for race in to_split:
        country_lower = (race.country or "").lower()
        if "polsk" in country_lower or "poland" in country_lower:
            race.region = "PL"
        else:
            race.region = "SK"
        race.save(update_fields=["region"])


def reverse_split(apps, _schema_editor):
    Race = apps.get_model("races", "Race")
    Race.objects.filter(region__in=["SK", "PL"]).update(region="SKPL")


class Migration(migrations.Migration):

    dependencies = [
        ("races", "0005_populate_top_warn_detail"),
    ]

    operations = [
        migrations.AlterField(
            model_name="race",
            name="region",
            field=models.CharField(
                blank=True,
                choices=[
                    ("CZ", "Česko"),
                    ("SK", "Slovensko"),
                    ("PL", "Polsko"),
                    ("ALP", "Alpy"),
                    ("SEV", "Skandinávie / sever"),
                    ("IBE", "Ibérie"),
                    ("BAL", "Balkán / Řecko"),
                    ("OST", "Ostrovy"),
                    ("SVET", "Svět"),
                    # Legacy — držíme pro reverse migration safe rollback.
                    ("SKPL", "Slovensko / Polsko"),
                ],
                db_index=True,
                default="",
                max_length=10,
            ),
        ),
        migrations.RunPython(split_skpl, reverse_split),
    ]
