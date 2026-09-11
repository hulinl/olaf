"""Data migrace 2026-09-11: sluggy typu `run-01-kopie[-N]` nebo eventy
s titulem `X (kopie)` přejmenujeme na čistý `slugify(title)[-N]`.

Původní slug se ukládá do `EventSlugAlias`, takže rozeslané odkazy
zůstanou funkční přes 308 redirect. Migrace je bezpečná — pokud
event.title obsahuje literární „(kopie)", vyčistíme ho z titulu i
slugu; pokud slug nezačíná/nekončí `-kopie`, přeskočíme.

Reversní běh je no-op — starý „ošklivý" slug zpátky negenerujeme.
"""
from django.db import migrations
from django.utils.text import slugify

KOPIE_SUFFIXES = (" (kopie)", "(kopie)")


def strip_kopie_from_title(title: str) -> str:
    """Odebere trailing `(kopie)` z titulu, opakovaně pokud tam bylo
    víckrát (kopie kopie). Whitespace se osekne."""
    cleaned = title
    changed = True
    while changed:
        changed = False
        for suffix in KOPIE_SUFFIXES:
            if cleaned.endswith(suffix):
                cleaned = cleaned[: -len(suffix)].rstrip()
                changed = True
                break
    return cleaned or title


def clean_slugs(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    EventSlugAlias = apps.get_model("events", "EventSlugAlias")

    # Vybíráme přes .all_objects semantics — apps.get_model vrací
    # default manager, ale trashed events mají trashed_at != NULL a
    # tudíž je default manager stejně nevrací. Pro účely úklidu
    # slugů to nevadí; trashed eventy si necháme být.
    for event in Event.objects.all():
        needs_slug_fix = "-kopie" in event.slug
        needs_title_fix = any(
            event.title.endswith(sfx) for sfx in KOPIE_SUFFIXES
        )
        if not needs_slug_fix and not needs_title_fix:
            continue

        old_slug = event.slug
        new_title = strip_kopie_from_title(event.title) if needs_title_fix else event.title
        base = slugify(new_title) or "akce"

        if needs_slug_fix:
            candidate = base
            n = 2
            while (
                Event.objects.filter(workspace=event.workspace, slug=candidate)
                .exclude(pk=event.pk)
                .exists()
            ):
                candidate = f"{base}-{n}"
                n += 1
            event.slug = candidate

        if needs_title_fix:
            event.title = new_title

        event.save(update_fields=["slug", "title"])

        # Backward-compat alias pro rozeslané odkazy. Když už alias
        # se stejným old_slug existuje, update_or_create ho přepíše
        # na tento event.
        if needs_slug_fix and old_slug != event.slug:
            EventSlugAlias.objects.update_or_create(
                workspace=event.workspace,
                old_slug=old_slug,
                defaults={"event": event},
            )


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0041_eventslugalias"),
    ]

    operations = [
        migrations.RunPython(clean_slugs, migrations.RunPython.noop),
    ]
