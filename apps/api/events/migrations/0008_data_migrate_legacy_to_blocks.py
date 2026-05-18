"""Migrate per-event "legacy" content fields onto the Event.blocks JSON.

Background
----------
The Event model historically carried structured content fields next to
`blocks` — highlights / included / not_included / program / faq /
transport_info / accommodation_info / gear_info / difficulty_level+note /
additional_cost_note / price_text. The public landing rendered them via
a hardcoded fallback section list when `blocks` was empty.

Going forward the block builder is the only way to edit landing content
and the `event-form` is reserved for event mechanics (time, capacity,
visibility, RSVP, …). This migration converts every event's legacy
fields into the equivalent block payload (Phase 2 schema) so the next
schema migration can drop the columns without data loss.

Block types created here:
- `days`            (from `program`)               only if no days block exists
- `included_split` (from included/not_included
                    + additional_cost_note + price_text)
                                                    only if no included_split exists
- `prose`           (from `highlights`)             only if event has highlights
                                                    and no prose block with
                                                    eyebrow="Highlights"
- `faq`             (from `faq`)                    only if non-empty + no faq block
- `practical`       (transport_info, accommodation_info, gear_info,
                     difficulty_level, difficulty_note)
                                                    only if any field is set
                                                    and no practical block

Existing blocks are never modified — new blocks are appended in a
predictable order at the end of the list.
"""
from __future__ import annotations

import uuid

from django.db import migrations


def _new_id(block_type: str) -> str:
    return f"{block_type}-{uuid.uuid4().hex[:8]}"


def _has_block(blocks: list, block_type: str) -> bool:
    return any(isinstance(b, dict) and b.get("type") == block_type for b in blocks)


def _has_prose_with_eyebrow(blocks: list, eyebrow: str) -> bool:
    eyebrow_lower = eyebrow.lower()
    for b in blocks:
        if not isinstance(b, dict) or b.get("type") != "prose":
            continue
        payload = b.get("payload") or {}
        if str(payload.get("eyebrow", "")).lower() == eyebrow_lower:
            return True
    return False


def _build_days_block(program: list) -> dict | None:
    days = []
    for item in program:
        if not isinstance(item, dict):
            continue
        days.append(
            {
                "label": str(item.get("day", "")),
                "title": str(item.get("title", "")),
                "body": str(item.get("body", "")),
            }
        )
    if not days:
        return None
    return {"id": _new_id("days"), "type": "days", "payload": {"days": days}}


def _build_included_split_block(
    included: list,
    not_included: list,
    price_text: str,
    additional_cost_note: str,
) -> dict | None:
    inc_items = [
        {"label": str(x), "desc": ""} for x in (included or []) if str(x).strip()
    ]
    not_items = [
        {"label": str(x), "desc": ""}
        for x in (not_included or [])
        if str(x).strip()
    ]
    if not inc_items and not not_items and not price_text:
        return None
    # The schema wants price_value + optional price_unit; we have a free-form
    # price_text like "2 450 Kč". Best-effort split on the last space.
    price_value, price_unit = "", ""
    pt = (price_text or "").strip()
    if pt:
        parts = pt.rsplit(" ", 1)
        if len(parts) == 2 and parts[1] and not parts[1][0].isdigit():
            price_value, price_unit = parts[0], parts[1]
        else:
            price_value = pt
    note = additional_cost_note or ""
    return {
        "id": _new_id("included"),
        "type": "included_split",
        "payload": {
            "included": inc_items,
            "not_included": not_items,
            "price_value": price_value,
            "price_unit": price_unit,
            "price_note": note,
        },
    }


def _build_highlights_prose(highlights: list) -> dict | None:
    items = [str(x).strip() for x in (highlights or []) if str(x).strip()]
    if not items:
        return None
    body = "\n\n".join(f"• {item}" for item in items)
    return {
        "id": _new_id("prose"),
        "type": "prose",
        "payload": {
            "eyebrow": "Highlights",
            "heading": "Na co se zaměříme",
            "body": body,
            "image_url": "",
            "image_side": "right",
        },
    }


def _build_faq_block(faq: list) -> dict | None:
    items = []
    for item in faq or []:
        if not isinstance(item, dict):
            continue
        q = str(item.get("question", "")).strip()
        a = str(item.get("answer", "")).strip()
        if q and a:
            items.append({"question": q, "answer": a})
    if not items:
        return None
    return {
        "id": _new_id("faq"),
        "type": "faq",
        "payload": {"eyebrow": "FAQ", "title": "Časté dotazy", "items": items},
    }


def _build_practical_block(
    transport: str,
    accommodation: str,
    gear: str,
    difficulty_level: int,
    difficulty_note: str,
) -> dict | None:
    if not (
        transport or accommodation or gear or difficulty_level or difficulty_note
    ):
        return None
    return {
        "id": _new_id("practical"),
        "type": "practical",
        "payload": {
            "eyebrow": "Praktické info",
            "title": "Doprava, ubytování, výbava",
            "transport": transport or "",
            "accommodation": accommodation or "",
            "gear": gear or "",
            "difficulty_level": int(difficulty_level or 0),
            "difficulty_note": difficulty_note or "",
        },
    }


def migrate_forward(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    for event in Event.objects.all():
        blocks = list(event.blocks or [])

        if event.program and not _has_block(blocks, "days"):
            b = _build_days_block(event.program)
            if b:
                blocks.append(b)

        if (event.included or event.not_included or event.price_text) and not _has_block(
            blocks, "included_split"
        ):
            b = _build_included_split_block(
                event.included,
                event.not_included,
                event.price_text,
                event.additional_cost_note,
            )
            if b:
                blocks.append(b)

        if event.highlights and not _has_prose_with_eyebrow(blocks, "Highlights"):
            b = _build_highlights_prose(event.highlights)
            if b:
                blocks.append(b)

        if event.faq and not _has_block(blocks, "faq"):
            b = _build_faq_block(event.faq)
            if b:
                blocks.append(b)

        if not _has_block(blocks, "practical"):
            b = _build_practical_block(
                event.transport_info,
                event.accommodation_info,
                event.gear_info,
                event.difficulty_level,
                event.difficulty_note,
            )
            if b:
                blocks.append(b)

        if blocks != list(event.blocks or []):
            event.blocks = blocks
            event.save(update_fields=["blocks"])


def migrate_backward(apps, schema_editor):
    """No-op. The schema migration that follows drops the legacy fields,
    so a reverse run cannot reconstruct them from blocks. We accept that
    blocks created here will remain on the event after a reverse — they
    are valid block payloads."""


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0007_event_communities"),
    ]

    operations = [
        migrations.RunPython(migrate_forward, migrate_backward),
    ]
