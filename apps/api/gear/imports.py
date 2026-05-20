"""Parsing + upsert logic for Notion gear-database CSV exports.

Used by both the management command (`import_gear_csv`) and the HTTP
upload endpoint so behaviour is identical regardless of entry point.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Any

from django.db import transaction

from .models import GearItem, GearList, GearListItem

_LIST_CELL_PIECE_RE = re.compile(
    r"""
    \s*
    (?P<name>.+?)        # list name (non-greedy)
    \s*
    \(                    # open paren before URL
    (?P<url>https?://[^\s)]+)
    \)
    \s*
    """,
    re.VERBOSE,
)

# Pulls the trailing 32-hex UUID Notion stamps into every page URL,
# e.g. .../Skialp-Alpy-ledovec-1a28fcec798580a4b4efcd25dfdffad4?pvs=21
_NOTION_UUID_RE = re.compile(r"([a-f0-9]{32})(?:\?|$)")


def _notion_marker(url: str) -> str:
    """Stable per-list identifier. The Notion UUID is what distinguishes
    multiple "Untitled" lists from each other."""
    m = _NOTION_UUID_RE.search(url)
    return m.group(1) if m else url


def _parse_list_cell(cell: str) -> list[tuple[str, str]]:
    """Return [(name, notion_marker), ...] for one row's `gear list` cell."""
    if not cell:
        return []
    pairs: list[tuple[str, str]] = []
    for match in _LIST_CELL_PIECE_RE.finditer(cell):
        name = match.group("name").strip().strip(",").strip()
        marker = _notion_marker(match.group("url"))
        if name and marker:
            pairs.append((name, marker))
    return pairs


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(re.sub(r"[^\d]", "", s) or "0") or None
    except ValueError:
        return None


def _build_note(row: dict[str, str]) -> str:
    """Stash metadata that doesn't fit GearItem's V1 schema into the note
    field. Price + product detail + type tag — owner can clean up later."""
    bits: list[str] = []
    specific = (row.get("specific type") or "").strip()
    if specific:
        bits.append(specific)
    price = (row.get("price") or "").strip()
    if price:
        bits.append(f"Cena: {price}")
    type_tag = (row.get("type") or "").strip().lower()
    if type_tag in ("consumable", "worn", "camping"):
        bits.append(f"[{type_tag}]")
    return " · ".join(bits)[:200]


@dataclass
class ImportResult:
    rows: int
    items_created: int
    items_backfilled: int
    lists_total: int
    edges_created: int


def import_notion_gear_csv(*, user, csv_content: bytes | str) -> ImportResult:
    """Parse a Notion gear-database CSV and upsert into `user`'s catalog.

    Items are upserted by (user, name); lists by an `[import:<uuid>]`
    marker stashed in `description`. Re-running the same CSV is a no-op.

    Accepts either bytes (from a file upload) or str (from the mgmt
    command). UTF-8 with optional BOM, as Notion exports.
    """
    text = (
        csv_content.decode("utf-8-sig")
        if isinstance(csv_content, bytes)
        else csv_content
    )
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    # First pass: collect every unique list marker, assigning numbered
    # display names to the Untitled ones.
    markers_seen: dict[str, str] = {}
    untitled_count = 0
    for row in rows:
        for name, marker in _parse_list_cell(row.get("gear list") or ""):
            if marker in markers_seen:
                continue
            if name.lower() == "untitled":
                untitled_count += 1
                markers_seen[marker] = f"Seznam {untitled_count}"
            else:
                markers_seen[marker] = name

    items_created = 0
    items_backfilled = 0
    edges_created = 0

    with transaction.atomic():
        lists_by_marker: dict[str, GearList] = {}
        for marker, name in markers_seen.items():
            tag = f"[import:{marker}]"
            glist = GearList.objects.filter(
                user=user, description__contains=tag
            ).first()
            if glist is None:
                glist = GearList.objects.create(
                    user=user, name=name, description=tag
                )
            lists_by_marker[marker] = glist

        for row in rows:
            name = (row.get("name") or "").strip()
            if not name:
                continue
            weight_g = _parse_int(row.get("unit weight [grams]"))
            category = (row.get("category") or "").strip()
            url = (row.get("link") or "").strip()
            note = _build_note(row)

            item, created = GearItem.objects.get_or_create(
                user=user,
                name=name[:200],
                defaults={
                    "weight_g": weight_g,
                    "url": url[:600],
                    "category": category[:60],
                    "note": note,
                },
            )
            if created:
                items_created += 1
            else:
                dirty = False
                if item.weight_g is None and weight_g is not None:
                    item.weight_g = weight_g
                    dirty = True
                if not item.url and url:
                    item.url = url[:600]
                    dirty = True
                if not item.category and category:
                    item.category = category[:60]
                    dirty = True
                if not item.note and note:
                    item.note = note
                    dirty = True
                if dirty:
                    item.save()
                    items_backfilled += 1

            qty = _parse_int(row.get("qty")) or 1
            for _, marker in _parse_list_cell(row.get("gear list") or ""):
                glist = lists_by_marker.get(marker)
                if glist is None:
                    continue
                _, edge_created = GearListItem.objects.get_or_create(
                    gear_list=glist,
                    item=item,
                    defaults={"quantity": qty},
                )
                if edge_created:
                    edges_created += 1

    return ImportResult(
        rows=len(rows),
        items_created=items_created,
        items_backfilled=items_backfilled,
        lists_total=len(lists_by_marker),
        edges_created=edges_created,
    )
