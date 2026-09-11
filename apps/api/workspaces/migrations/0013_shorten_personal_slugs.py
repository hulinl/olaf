"""Data migrace 2026-09-11: personal workspacy generované migrací 0012
dostaly slug jako `lubomir-hulin-muj-prostor`. Zkrátíme je na
`lubomir-hulin` s dedup přes -N (pokud koliduje s reálnou komunitou).
Starý slug se ukládá do WorkspaceSlugAlias, staré URL zůstávají
funkční přes 308 redirect.

Migrace se vztahuje jen na `is_personal=True` workspacy končící
`-muj-prostor` — reálné komunity, které by náhodou takový slug měly,
necháme být.
"""
from django.db import migrations

SUFFIX = "-muj-prostor"
MAX_SLUG_LEN = 50


def shorten_personal_slugs(apps, schema_editor):
    Workspace = apps.get_model("workspaces", "Workspace")
    WorkspaceSlugAlias = apps.get_model("workspaces", "WorkspaceSlugAlias")

    for ws in Workspace.objects.filter(
        is_personal=True, slug__endswith=SUFFIX
    ):
        old_slug = ws.slug
        base = old_slug[: -len(SUFFIX)] or f"w-{ws.pk}"
        candidate = base[:MAX_SLUG_LEN]
        n = 2
        while (
            Workspace.objects.filter(slug=candidate).exclude(pk=ws.pk).exists()
        ):
            suffix = f"-{n}"
            candidate = f"{base[: MAX_SLUG_LEN - len(suffix)]}{suffix}"
            n += 1
        if candidate == old_slug:
            continue

        ws.slug = candidate
        ws.save(update_fields=["slug"])
        WorkspaceSlugAlias.objects.update_or_create(
            old_slug=old_slug,
            defaults={"workspace": ws},
        )


class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0012_rename_personal_slugs"),
    ]

    operations = [
        migrations.RunPython(shorten_personal_slugs, migrations.RunPython.noop),
    ]
