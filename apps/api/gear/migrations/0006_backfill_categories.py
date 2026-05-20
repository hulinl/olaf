"""Backfill GearCategory from existing GearItem.category strings.

For every (user, distinct non-empty category) pair, get_or_create a
GearCategory and point the matching GearItem rows at it. Idempotent.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    GearItem = apps.get_model("gear", "GearItem")
    GearCategory = apps.get_model("gear", "GearCategory")

    # Walk users that have at least one non-empty category string.
    pairs = (
        GearItem.objects.exclude(category="")
        .values_list("user_id", "category")
        .distinct()
    )
    cache: dict[tuple[int, str], int] = {}
    for user_id, name in pairs:
        name_clean = (name or "").strip()[:60]
        if not name_clean:
            continue
        key = (user_id, name_clean)
        if key not in cache:
            cat, _ = GearCategory.objects.get_or_create(
                user_id=user_id, name=name_clean
            )
            cache[key] = cat.id

    for (user_id, name), cat_id in cache.items():
        GearItem.objects.filter(
            user_id=user_id, category=name, category_obj__isnull=True
        ).update(category_obj_id=cat_id)


def unbackfill(apps, schema_editor):
    # Reverse: clear the FKs but leave categories + name strings alone
    # so re-applying the forward migration is still idempotent.
    GearItem = apps.get_model("gear", "GearItem")
    GearItem.objects.update(category_obj=None)


class Migration(migrations.Migration):
    dependencies = [
        ("gear", "0005_alter_gearitem_category_gearcategory_and_more"),
    ]

    operations = [migrations.RunPython(backfill, unbackfill)]
