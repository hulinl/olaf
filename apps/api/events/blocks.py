"""Event landing-page block schema + validators.

Each Event has an ordered list of blocks stored as JSONB in `Event.blocks`.
Block payloads are validated against the schemas below before persisting.
The public landing iterates blocks; an empty list falls back to legacy
rendering from the Event's structured fields.

V1 ships 5 block types — hero / prose / stats / days / included_split.
Adding a new type means:
  1. Add an entry to BLOCK_SCHEMAS below
  2. Add the corresponding TS type + renderer on the frontend
  3. Optional: editor form (Phase 2 — frontend builder)
"""
from __future__ import annotations

from typing import Any


class BlockValidationError(Exception):
    """Raised when a block payload does not match its declared schema."""

    def __init__(self, block_index: int, message: str) -> None:
        super().__init__(f"Block #{block_index}: {message}")
        self.block_index = block_index
        self.message = message


def _expect_str(value: Any, key: str, *, allow_blank: bool = True) -> str:
    if not isinstance(value, str):
        raise ValueError(f"'{key}' must be a string")
    if not allow_blank and not value.strip():
        raise ValueError(f"'{key}' is required")
    return value


def _expect_list(value: Any, key: str) -> list:
    if not isinstance(value, list):
        raise ValueError(f"'{key}' must be a list")
    return value


def _expect_dict(value: Any, key: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"'{key}' must be an object")
    return value


# --- per-block-type validators ------------------------------------------------


def _validate_hero(payload: dict) -> None:
    _expect_str(payload.get("cover_url", ""), "cover_url")
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title_override", ""), "title_override")
    _expect_str(payload.get("subtitle", ""), "subtitle")
    _expect_str(payload.get("cta_label", ""), "cta_label")
    _expect_str(payload.get("cta_href", ""), "cta_href")
    meta = _expect_list(payload.get("meta", []), "meta")
    for i, tile in enumerate(meta):
        item = _expect_dict(tile, f"meta[{i}]")
        _expect_str(item.get("k", ""), f"meta[{i}].k", allow_blank=False)
        _expect_str(item.get("v", ""), f"meta[{i}].v", allow_blank=False)


def _validate_prose(payload: dict) -> None:
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("heading", ""), "heading")
    _expect_str(payload.get("body", ""), "body")
    _expect_str(payload.get("image_url", ""), "image_url")
    side = payload.get("image_side", "right")
    if side not in ("left", "right"):
        raise ValueError("'image_side' must be 'left' or 'right'")


def _validate_stats(payload: dict) -> None:
    tiles = _expect_list(payload.get("tiles", []), "tiles")
    if not tiles:
        raise ValueError("'tiles' must contain at least one entry")
    for i, tile in enumerate(tiles):
        item = _expect_dict(tile, f"tiles[{i}]")
        _expect_str(item.get("label", ""), f"tiles[{i}].label", allow_blank=False)
        _expect_str(item.get("value", ""), f"tiles[{i}].value", allow_blank=False)
    payload.setdefault("dark", False)
    if not isinstance(payload["dark"], bool):
        raise ValueError("'dark' must be boolean")


def _validate_days(payload: dict) -> None:
    # Volitelný popisek (eyebrow) + nadpis sekce — bez nich se použijí
    # defaulty „Program" / „Den po dni" v rendereru. Owner si je může
    # přepsat na něco vlastního ("Itinerář", "Plán víkendu", apod.).
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")
    _expect_str(payload.get("lead", ""), "lead")
    days = _expect_list(payload.get("days", []), "days")
    if not days:
        raise ValueError("'days' must contain at least one entry")
    for i, d in enumerate(days):
        item = _expect_dict(d, f"days[{i}]")
        # Optional / nullable strings:
        for k in (
            "label", "num", "title", "route", "body",
            "time", "distance", "ascent", "descent",
            "map_url", "image_url",
        ):
            v = item.get(k, "")
            _expect_str(v, f"days[{i}].{k}")
        # Body už není povinné — owner často popis dne dotahuje po
        # ingestu z Notion-u a chce mít rozpracovaný program uložený
        # i bez textu (jen čísla/title/stats). User report 2026-06-25.


def _validate_included_split(payload: dict) -> None:
    included = _expect_list(payload.get("included", []), "included")
    not_included = _expect_list(payload.get("not_included", []), "not_included")
    for label, lst in (("included", included), ("not_included", not_included)):
        for i, item in enumerate(lst):
            it = _expect_dict(item, f"{label}[{i}]")
            _expect_str(it.get("label", ""), f"{label}[{i}].label", allow_blank=False)
            _expect_str(it.get("desc", ""), f"{label}[{i}].desc")
    _expect_str(payload.get("price_value", ""), "price_value")
    _expect_str(payload.get("price_unit", ""), "price_unit")
    _expect_str(payload.get("price_note", ""), "price_note")


def _validate_gallery(payload: dict) -> None:
    # Gallery block pulls images from event.images at render time, so the
    # payload only carries optional presentation overrides.
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")


def _validate_map(payload: dict) -> None:
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")
    _expect_str(payload.get("caption", ""), "caption")
    map_url = _expect_str(payload.get("map_url", ""), "map_url", allow_blank=False)
    # Soft check — Mapy.cz/Mapy.com or fallback to a plain link.
    if not map_url.startswith(("http://", "https://")):
        raise ValueError("'map_url' must be an absolute URL")


def _validate_faq(payload: dict) -> None:
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")
    items = _expect_list(payload.get("items", []), "items")
    if not items:
        raise ValueError("'items' must contain at least one entry")
    for i, item in enumerate(items):
        it = _expect_dict(item, f"items[{i}]")
        _expect_str(it.get("question", ""), f"items[{i}].question", allow_blank=False)
        _expect_str(it.get("answer", ""), f"items[{i}].answer", allow_blank=False)


def _validate_practical(payload: dict) -> None:
    """Practical-info block: optional transport/accommodation/gear columns +
    optional difficulty (level 0-5 + free-text note). Renders as the
    "Praktické info" + "Náročnost" section pair from the legacy layout.
    """
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")
    _expect_str(payload.get("transport", ""), "transport")
    _expect_str(payload.get("accommodation", ""), "accommodation")
    _expect_str(payload.get("gear", ""), "gear")
    _expect_str(payload.get("difficulty_note", ""), "difficulty_note")
    lvl = payload.get("difficulty_level", 0)
    if not isinstance(lvl, int) or lvl < 0 or lvl > 5:
        raise ValueError("'difficulty_level' must be an integer between 0 and 5")


def _validate_gear(payload: dict) -> None:
    """Gear-list reference block.

    Carries just a slug — the public event endpoint embeds the
    referenced list's data so the frontend renders without a second
    fetch. Slug existence and visibility are checked at render time,
    not save time, so an owner can attach a list before flipping it
    public (or have it gracefully empty out if they later make it
    private).

    Optional `featured_entry_ids` (list of ints) narrows the rendered
    items to a curated subset on the public landing — owner picks the
    "top N" via checkboxes in the editor. Empty / missing = render
    every entry (back-compat with blocks created before this slice).
    """
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")
    _expect_str(
        payload.get("list_slug", ""), "list_slug", allow_blank=False
    )
    if "featured_entry_ids" in payload:
        ids = payload["featured_entry_ids"]
        if not isinstance(ids, list):
            raise ValueError("'featured_entry_ids' must be a list of ints")
        for i, x in enumerate(ids):
            if not isinstance(x, int) or x < 0:
                raise ValueError(
                    f"'featured_entry_ids[{i}]' must be a non-negative int"
                )


def _validate_organizers(payload: dict) -> None:
    """Organizers reference block.

    Carries user_ids selected from event's EventCollaborators (a
    workspace admin or co-creator). At render time the public event
    payload joins these IDs against User and exposes display_name +
    bio + avatar_url through `organizers_by_user_id` side-lookup, so
    the renderer doesn't need a second fetch.

    Existence of the user is NOT enforced at save — owner can save
    a block while still picking collaborators, and the renderer
    gracefully drops user_ids that no longer match a known user.
    """
    _expect_str(payload.get("eyebrow", ""), "eyebrow")
    _expect_str(payload.get("title", ""), "title")
    _expect_str(payload.get("intro", ""), "intro")
    user_ids = _expect_list(payload.get("user_ids", []), "user_ids")
    for i, x in enumerate(user_ids):
        if not isinstance(x, int) or x < 0:
            raise ValueError(
                f"'user_ids[{i}]' must be a non-negative int"
            )


BLOCK_SCHEMAS: dict[str, Any] = {
    "hero": _validate_hero,
    "prose": _validate_prose,
    "stats": _validate_stats,
    "days": _validate_days,
    "included_split": _validate_included_split,
    "gallery": _validate_gallery,
    "map": _validate_map,
    "faq": _validate_faq,
    "practical": _validate_practical,
    "gear": _validate_gear,
    "organizers": _validate_organizers,
}

KNOWN_BLOCK_TYPES = tuple(BLOCK_SCHEMAS.keys())


def validate_blocks(blocks: Any) -> None:
    """Top-level validator. Raises BlockValidationError on first failure."""
    if not isinstance(blocks, list):
        raise BlockValidationError(-1, "blocks must be a list")
    seen_ids: set[str] = set()
    for i, block in enumerate(blocks):
        if not isinstance(block, dict):
            raise BlockValidationError(i, "block must be an object")
        block_type = block.get("type")
        if block_type not in BLOCK_SCHEMAS:
            raise BlockValidationError(
                i,
                f"unknown type '{block_type}'. Known: {sorted(BLOCK_SCHEMAS.keys())}",
            )
        block_id = block.get("id", "")
        if not isinstance(block_id, str) or not block_id:
            raise BlockValidationError(i, "block.id must be a non-empty string")
        if block_id in seen_ids:
            raise BlockValidationError(i, f"duplicate block id '{block_id}'")
        seen_ids.add(block_id)
        payload = block.get("payload", {})
        if not isinstance(payload, dict):
            raise BlockValidationError(i, "block.payload must be an object")
        try:
            BLOCK_SCHEMAS[block_type](payload)
        except ValueError as exc:
            raise BlockValidationError(i, str(exc)) from exc
