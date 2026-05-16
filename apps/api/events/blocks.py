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
        # At minimum each day should have either a title or body so we don't
        # render an empty card.
        if not item.get("title") and not item.get("body"):
            raise ValueError(f"days[{i}] must have at least 'title' or 'body'")


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


BLOCK_SCHEMAS: dict[str, Any] = {
    "hero": _validate_hero,
    "prose": _validate_prose,
    "stats": _validate_stats,
    "days": _validate_days,
    "included_split": _validate_included_split,
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
