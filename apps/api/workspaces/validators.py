"""Slug validation for workspaces, communities, and events.

Reserved paths must not collide with platform routes (PRD §4.3, §9).
"""
import re

from django.core.exceptions import ValidationError

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SLUG_MAX_LENGTH = 50

RESERVED_WORKSPACE_SLUGS = frozenset(
    {
        # Platform routes
        "app",
        "api",
        "static",
        "admin",
        "media",
        # Auth pages
        "login",
        "signup",
        "signin",
        "signout",
        "logout",
        "register",
        # App pages
        "dashboard",
        "settings",
        "account",
        "communities",
        "events",
        # Marketing
        "pricing",
        "legal",
        "terms",
        "privacy",
        "about",
        "help",
        "contact",
        "blog",
        # Invitations + namespaces
        "invite",
        "e",
        "r",
        "g",
        "c",
        "i",
        # Infrastructure
        "www",
        "mail",
        "mx",
        "ns",
        "assets",
    }
)


def validate_workspace_slug(value: str) -> None:
    """Validate a workspace slug per PRD §4.3.

    Lowercased, hyphenated, ASCII alphanumeric, max 50 chars, not reserved.
    """
    if not value:
        raise ValidationError("Slug is required.")
    if len(value) > SLUG_MAX_LENGTH:
        raise ValidationError(
            f"Slug must be at most {SLUG_MAX_LENGTH} characters long."
        )
    if not SLUG_RE.match(value):
        raise ValidationError(
            "Slug must be lowercase ASCII letters and digits, "
            "with hyphens between words (e.g. 'olaf-adventures')."
        )
    if value in RESERVED_WORKSPACE_SLUGS:
        raise ValidationError(
            f"'{value}' is a reserved slug and cannot be used."
        )
