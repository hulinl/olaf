"""Import gear from a Notion CSV export.

Notion's gear-database export has one row per item, with a free-form
"gear list" column that comma-joins each list the item belongs to as
`"Name (notion-url)"`. Items can live in 0..N lists; lists are deduped
by Notion URL so multiple "Untitled" entries don't collapse into one.

Usage:
    python manage.py import_gear_csv --csv path/to/export.csv \\
        --email user@example.com [--dry-run]

Idempotent: re-running the same CSV against the same user is safe.
GearItem is upserted on (user, name); GearList on (user,
import_marker) where import_marker is the Notion UUID. GearListItem
quantity is set to the row's qty (default 1).

Optional CSV columns honoured if present (the "_all" Notion export has
more than the short one): specific type, price, qty, type.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from gear.models import GearItem, GearList, GearListItem


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
        # Some weights come as "1,200" → strip non-digits.
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
    return " · ".join(bits)[:200]  # GearItem.note isn't capped but keep tidy


class Command(BaseCommand):
    help = "Import a Notion gear-database CSV export into a user's catalog."

    def add_arguments(self, parser):
        parser.add_argument("--csv", required=True, help="Path to the CSV file")
        parser.add_argument(
            "--email",
            required=True,
            help="Owner of the imported catalog (existing User)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse + report but don't write anything",
        )

    def handle(self, *args, **opts):
        csv_path = Path(opts["csv"]).expanduser()
        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        try:
            user = User.objects.get(email__iexact=opts["email"])
        except User.DoesNotExist as e:
            raise CommandError(f"No user with email {opts['email']!r}") from e

        dry = bool(opts["dry_run"])
        self.stdout.write(
            self.style.NOTICE(
                f"Importing {csv_path.name} → {user.email}"
                + (" (dry-run)" if dry else "")
            )
        )

        # First pass: collect lists, items, and item↔list edges. Second
        # pass writes inside one transaction so a partial failure rolls
        # back cleanly.
        with csv_path.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))

        # Build the lookup of every unique gear list this CSV refers to.
        # Two-pass approach: first pass for unique markers, second pass
        # to assign each "Untitled" marker a numbered display name.
        markers_seen: dict[str, str] = {}  # marker → chosen list name
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

        self.stdout.write(
            f"  → {len(rows)} items, {len(markers_seen)} distinct lists"
        )

        if dry:
            for marker, name in markers_seen.items():
                self.stdout.write(f"    list[{marker[:8]}…] = {name!r}")
            for r in rows[:5]:
                self.stdout.write(
                    f"    item: {r['name']!r}  cat={r['category']!r}"
                    f" weight={r.get('unit weight [grams]')!r}"
                )
            self.stdout.write(self.style.WARNING("Dry-run, no writes."))
            return

        with transaction.atomic():
            # Lists keyed by marker. We stash the marker in `description`
            # as `[import:<marker>]` so a re-run can find existing lists
            # without needing a schema change.
            lists_by_marker: dict[str, GearList] = {}
            for marker, name in markers_seen.items():
                tag = f"[import:{marker}]"
                glist = GearList.objects.filter(
                    user=user, description__contains=tag
                ).first()
                if glist is None:
                    glist = GearList.objects.create(
                        user=user,
                        name=name,
                        description=tag,
                    )
                lists_by_marker[marker] = glist

            items_created = 0
            items_updated = 0
            edges_added = 0
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
                    # Fill in fields the existing row left blank — don't
                    # overwrite anything the owner has already edited.
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
                        items_updated += 1

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
                        edges_added += 1

            self.stdout.write(
                self.style.SUCCESS(
                    f"Done. items: +{items_created} created, "
                    f"{items_updated} backfilled. "
                    f"lists: {len(lists_by_marker)}. "
                    f"edges: +{edges_added}."
                )
            )
