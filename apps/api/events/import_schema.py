"""JSON Schema for the event import endpoint.

Single source of truth for external clients (Claude Code skills, CLI
tools) that need to know the shape of the import payload. Exposed via
GET /api/events/import-schema/. Keep in sync with blocks.py validators
when adding new block types — the JSON Schema is documentation, the
validators are the runtime gate.
"""
from __future__ import annotations

EVENT_IMPORT_SCHEMA: dict = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://olaf.events/schema/event-import-v1.json",
    "title": "OLAF Event Import Payload",
    "description": (
        "Payload for POST /api/events/<workspace-slug>/import/. Creates "
        "or updates a draft Event with its landing-page blocks. Always "
        "lands as status=draft regardless of any 'status' field in the "
        "payload — the importer never publishes."
    ),
    "type": "object",
    "required": ["title", "slug", "starts_at", "ends_at"],
    "additionalProperties": False,
    "properties": {
        "external_ref": {
            "type": "string",
            "maxLength": 120,
            "description": (
                "Idempotency key. A stable string the caller picks per "
                "event source (e.g. 'beskydy-spring-camp-2026'). When "
                "the same ref already exists under this workspace, the "
                "endpoint updates the matching event instead of "
                "creating a duplicate. Omit on first import."
            ),
        },
        "slug": {
            "type": "string",
            "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
            "maxLength": 80,
            "description": (
                "URL slug under /<workspace>/e/<slug>. Lowercase "
                "ASCII + hyphens between words."
            ),
        },
        "title": {"type": "string", "maxLength": 200},
        "description": {
            "type": "string",
            "description": "Plain text summary. Empty allowed.",
        },
        "starts_at": {
            "type": "string",
            "format": "date-time",
            "description": "ISO 8601 with timezone (e.g. 2026-05-16T08:00:00+02:00).",
        },
        "ends_at": {
            "type": "string",
            "format": "date-time",
        },
        "tz": {
            "type": "string",
            "description": "IANA timezone, e.g. 'Europe/Prague'. Defaults to UTC.",
        },
        "location_text": {"type": "string", "maxLength": 300},
        "meeting_point_text": {"type": "string", "maxLength": 300},
        "location_url": {
            "type": "string",
            "format": "uri",
            "description": "Mapy.cz / Google Maps link to the venue.",
        },
        "capacity": {
            "type": ["integer", "null"],
            "minimum": 1,
            "description": "Max confirmed RSVPs. Null = unlimited.",
        },
        "waitlist_enabled": {"type": "boolean"},
        "require_phone_on_rsvp": {"type": "boolean"},
        "visibility": {
            "type": "string",
            "enum": ["public", "invite_only"],
        },
        "requires_approval": {"type": "boolean"},
        "price_amount": {
            "type": ["string", "number", "null"],
            "description": "Decimal as string or number. Null = free.",
        },
        "price_currency": {
            "type": "string",
            "enum": ["CZK", "EUR", "USD"],
        },
        "price_note": {"type": "string", "maxLength": 120},
        "payment_in_cash": {"type": "boolean"},
        "community_slugs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Workspace communities to publish the event into.",
        },
        "shared_workspace_slugs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Other workspaces the same owner controls.",
        },
        "blocks": {
            "type": "array",
            "description": (
                "Ordered list of landing-page content blocks. Each item "
                "has id (unique within the event), type (one of the "
                "registered block types), and payload (object whose "
                "shape depends on type — see $defs below)."
            ),
            "items": {
                "type": "object",
                "required": ["id", "type", "payload"],
                "properties": {
                    "id": {"type": "string", "minLength": 1},
                    "type": {
                        "type": "string",
                        "enum": [
                            "hero",
                            "prose",
                            "stats",
                            "days",
                            "included_split",
                            "gallery",
                            "map",
                            "faq",
                            "practical",
                            "gear",
                        ],
                    },
                    "payload": {"type": "object"},
                },
            },
        },
    },
    "$defs": {
        "block_hero": {
            "type": "object",
            "description": (
                "Cover image + title + meta tiles. Always block #1."
            ),
            "properties": {
                "cover_url": {"type": "string", "format": "uri"},
                "eyebrow": {
                    "type": "string",
                    "description": "Short label above the title (location, date).",
                },
                "title_override": {
                    "type": "string",
                    "description": "If empty, falls back to event.title.",
                },
                "subtitle": {"type": "string"},
                "cta_label": {"type": "string"},
                "cta_href": {"type": "string"},
                "meta": {
                    "type": "array",
                    "description": "Pill tiles under the title.",
                    "items": {
                        "type": "object",
                        "required": ["k", "v"],
                        "properties": {
                            "k": {"type": "string"},
                            "v": {"type": "string"},
                        },
                    },
                },
            },
        },
        "block_prose": {
            "type": "object",
            "description": "Text block with optional side image.",
            "properties": {
                "eyebrow": {"type": "string"},
                "heading": {"type": "string"},
                "body": {"type": "string", "description": "Plain text. Newlines render as paragraphs."},
                "image_url": {"type": "string", "format": "uri"},
                "image_side": {"type": "string", "enum": ["left", "right"]},
            },
        },
        "block_stats": {
            "type": "object",
            "description": "Grid of label/value tiles.",
            "required": ["tiles"],
            "properties": {
                "dark": {"type": "boolean"},
                "tiles": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "required": ["label", "value"],
                        "properties": {
                            "label": {"type": "string"},
                            "value": {"type": "string"},
                        },
                    },
                },
            },
        },
        "block_days": {
            "type": "object",
            "description": "Multi-day itinerary (one card per day).",
            "required": ["days"],
            "properties": {
                "lead": {"type": "string", "description": "Section intro."},
                "days": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "description": "At minimum 'title' or 'body' must be set.",
                        "properties": {
                            "label": {"type": "string", "description": "e.g. 'Den 1 / Středa'"},
                            "num": {"type": "string", "description": "Big numeral, e.g. '01'"},
                            "title": {"type": "string"},
                            "route": {"type": "string"},
                            "body": {"type": "string"},
                            "time": {"type": "string"},
                            "distance": {"type": "string"},
                            "ascent": {"type": "string"},
                            "descent": {"type": "string"},
                            "image_url": {"type": "string", "format": "uri"},
                            "map_url": {"type": "string", "format": "uri"},
                        },
                    },
                },
            },
        },
        "block_included_split": {
            "type": "object",
            "description": "Co je / Co není v ceně + price card.",
            "properties": {
                "price_value": {"type": "string", "description": "e.g. '11 000'"},
                "price_unit": {"type": "string", "description": "e.g. 'Kč'"},
                "price_note": {"type": "string"},
                "included": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["label"],
                        "properties": {
                            "label": {"type": "string"},
                            "desc": {"type": "string"},
                        },
                    },
                },
                "not_included": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["label"],
                        "properties": {
                            "label": {"type": "string"},
                            "desc": {"type": "string"},
                        },
                    },
                },
            },
        },
        "block_gallery": {
            "type": "object",
            "description": (
                "Pulls images from event.images at render time; payload "
                "only carries optional presentation overrides."
            ),
            "properties": {
                "eyebrow": {"type": "string"},
                "title": {"type": "string"},
            },
        },
        "block_map": {
            "type": "object",
            "required": ["map_url"],
            "properties": {
                "eyebrow": {"type": "string"},
                "title": {"type": "string"},
                "caption": {"type": "string"},
                "map_url": {"type": "string", "format": "uri"},
            },
        },
        "block_faq": {
            "type": "object",
            "required": ["items"],
            "properties": {
                "eyebrow": {"type": "string"},
                "title": {"type": "string"},
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "required": ["question", "answer"],
                        "properties": {
                            "question": {"type": "string"},
                            "answer": {"type": "string"},
                        },
                    },
                },
            },
        },
        "block_practical": {
            "type": "object",
            "description": "Praktické info — transport / accommodation / gear + difficulty slider.",
            "properties": {
                "eyebrow": {"type": "string"},
                "title": {"type": "string"},
                "transport": {"type": "string"},
                "accommodation": {"type": "string"},
                "gear": {"type": "string"},
                "difficulty_level": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 5,
                },
                "difficulty_note": {"type": "string"},
            },
        },
        "block_gear": {
            "type": "object",
            "description": "Reference to a GearList model owned by the same user.",
            "required": ["list_slug"],
            "properties": {
                "eyebrow": {"type": "string"},
                "title": {"type": "string"},
                "list_slug": {"type": "string"},
                "featured_entry_ids": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 0},
                },
            },
        },
    },
}
