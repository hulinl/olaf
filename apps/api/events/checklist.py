"""Roadmap / checklist computations for the event cockpit.

Two kinds of items:

1. AUTO — derived from the event's current state on each fetch. Things
   like "vyplň cenu", "publikuj akci", "definuj místo srazu". The item
   carries a deep-link to the page that flips it to done.

2. MANUAL — EventChecklistItem rows the owner adds for things the
   platform can't detect ("zajistit dopravu", "objednat trička").

Presets are short suggestion lists the owner picks from when adding a
manual item; the picker drops a row with a sensible default title +
description + category, no automation.
"""
from __future__ import annotations

from dataclasses import dataclass

from .models import Event


@dataclass
class AutoChecklistItem:
    key: str
    title: str
    description: str
    done: bool
    category: str
    action_href: str  # frontend deep-link; empty = no action


def auto_items_for_event(event: Event) -> list[AutoChecklistItem]:
    """All auto-derived checklist items in display order."""
    ws_slug = event.workspace.slug
    edit_base = f"/admin/eventy/{ws_slug}/{event.slug}/edit"
    detaily = f"{edit_base}/detaily"
    obsah = f"{edit_base}/obsah"
    galerie = f"{edit_base}/galerie"
    komunita_edit = f"/admin/komunity/{ws_slug}/edit"

    items: list[AutoChecklistItem] = []

    items.append(
        AutoChecklistItem(
            key="basics_title",
            title="Vyplň název a slug",
            description="Bez názvu se akce nedá publikovat.",
            done=bool(event.title and event.slug),
            category="basics",
            action_href=detaily,
        )
    )
    items.append(
        AutoChecklistItem(
            key="basics_intro",
            title="Krátký intro k akci",
            description="Jedna věta nebo dva odstavce — co účastník dostane.",
            done=bool(event.description and event.description.strip()),
            category="basics",
            action_href=detaily,
        )
    )
    items.append(
        AutoChecklistItem(
            key="basics_location",
            title="Lokalita a místo srazu",
            description="Kde se akce odehrává a kde se sejdete.",
            done=bool(event.location_text and event.meeting_point_text),
            category="basics",
            action_href=detaily,
        )
    )

    items.append(
        AutoChecklistItem(
            key="content_blocks",
            title="Naskládat obsah landing stránky",
            description="Hero, program, ceny, FAQ — bloky veřejné stránky.",
            done=bool(event.blocks and len(event.blocks) > 0),
            category="content",
            action_href=obsah,
        )
    )
    items.append(
        AutoChecklistItem(
            key="content_gallery",
            title="Nahraj pár fotek do galerie",
            description="Volitelné — galerie zvedne vizuální dojem o 50%.",
            done=event.images.exists(),
            category="content",
            action_href=galerie,
        )
    )

    if event.price_amount:
        items.append(
            AutoChecklistItem(
                key="payment_profile",
                title="Vyber fakturační profil",
                description="Z kterého profilu se vystavují faktury.",
                done=event.billing_profile_id is not None
                or _workspace_has_iban(event),
                category="payment",
                action_href=detaily,
            )
        )
        if not event.payment_in_cash:
            items.append(
                AutoChecklistItem(
                    key="payment_iban",
                    title="Nastav IBAN v komunitě",
                    description="Bez IBANu nelze vygenerovat QR Platbu.",
                    done=_workspace_has_iban(event),
                    category="payment",
                    action_href=komunita_edit,
                )
            )

    items.append(
        AutoChecklistItem(
            key="published",
            title="Publikovat akci",
            description="Dokud je akce Draft, registrace nejsou otevřené.",
            done=event.status == Event.STATUS_PUBLISHED,
            category="status",
            action_href=detaily,
        )
    )

    return items


def _workspace_has_iban(event: Event) -> bool:
    profile = event.billing_profile
    if profile and profile.iban:
        return True
    return bool(event.workspace.payment_iban)


# Suggestion presets used by the "+ Přidat ze šablony" picker.
# Each preset becomes a fresh EventChecklistItem (not done) when chosen.
CHECKLIST_PRESETS: list[dict] = [
    {
        "key": "risks",
        "title": "Sepsat rizika akce",
        "description": "Co se může pokazit a co s tím — bezpečnost účastníků.",
        "category": "risk",
    },
    {
        "key": "gear_list",
        "title": "Sepsat seznam vybavení",
        "description": "Co si účastník přiveze (lavinová sada, helma, ...).",
        "category": "gear",
    },
    {
        "key": "send_gear_list",
        "title": "Poslat seznam vybavení účastníkům",
        "description": "Email o vybavení 14 dní před akcí.",
        "category": "comms",
    },
    {
        "key": "reminder_1m",
        "title": "Připomínka měsíc před akcí",
        "description": "Pošli účastníkům upozornění + odkaz na účast.",
        "category": "comms",
    },
    {
        "key": "reminder_week",
        "title": "Připomínka týden před akcí",
        "description": "Sraz, počasí, kontakt.",
        "category": "comms",
    },
    {
        "key": "transport",
        "title": "Zajistit dopravu",
        "description": "Auto / autobus / koordinovat sdílení.",
        "category": "logistics",
    },
    {
        "key": "food",
        "title": "Zajistit stravu",
        "description": "Catering, restaurace, nákupy.",
        "category": "logistics",
    },
    {
        "key": "first_aid",
        "title": "Zkontrolovat lékárničku",
        "description": "Doplnit, ověřit expirace.",
        "category": "safety",
    },
    {
        "key": "insurance_check",
        "title": "Ověřit pojištění odpovědnosti",
        "description": "Pojistka pro celé období akce.",
        "category": "safety",
    },
    {
        "key": "post_event_thanks",
        "title": "Po akci poslat poděkování + fotky",
        "description": "Email s fotkami + výzva k další akci.",
        "category": "comms",
    },
]
