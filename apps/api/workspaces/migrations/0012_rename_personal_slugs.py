"""Data migrace 2026-09-11: existující `personal-<user_id>` slugy
přejmenujeme na čistý slugify(name)[-N]. Starý slug se ukládá do
WorkspaceSlugAlias, staré URL zůstávají funkční přes 308 redirect.

Personal workspaces mají typicky name typu „Jan Novák — můj prostor";
slugify z toho udělá `jan-novak-muj-prostor` (validní podle
SLUG_RE). Kdyby slug vyšel prázdný nebo koliduje, pattern padne
zpátky na `w-<pk>` (krátký fallback, aby existovala rozumná URL).
"""
from django.db import migrations
from django.utils.text import slugify

MAX_SLUG_LEN = 50


def _candidate_from_name(name: str) -> str:
    base = slugify(name)[:MAX_SLUG_LEN]
    if not base:
        return ""
    # Pokud po slugify skončí na "-", zoříznout.
    return base.rstrip("-")


def rename_personal_slugs(apps, schema_editor):
    Workspace = apps.get_model("workspaces", "Workspace")
    WorkspaceSlugAlias = apps.get_model("workspaces", "WorkspaceSlugAlias")

    for ws in Workspace.objects.filter(slug__startswith="personal-"):
        old_slug = ws.slug

        base = _candidate_from_name(ws.name) or f"w-{ws.pk}"
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
        ("workspaces", "0011_workspaceslugalias"),
    ]

    operations = [
        migrations.RunPython(rename_personal_slugs, migrations.RunPython.noop),
    ]
