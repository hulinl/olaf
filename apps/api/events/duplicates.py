"""Owner-facing duplicate-RSVP hint detection.

The DB already prevents `(event, user)` collisions, so this module is
about the trickier real-world case: the **same person registers
twice under different accounts**. Typical pattern from Spring Camp:
spouse + partner share an inbox, type one e-mail but both register;
or the user makes a typo, can't log in, and creates a fresh light
account with a slightly different email.

We surface this as a soft signal — `duplicate_hints` on the RSVP
serializer — so the owner sees a "⚠ Možný duplikát" badge and can
decide. We never block or merge automatically; this is a hint, not
a rule engine.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict

# Hint codes — Czech labels live on the frontend so they can move
# with brand tone without a backend redeploy.
HINT_SAME_PHONE = "same_phone"
HINT_SAME_NAME = "same_name"


def _normalize_phone(phone: str) -> str:
    """Strip everything that isn't a digit. +420 777 123 456 →
    420777123456 → still matches 777 123 456 (= 777123456) only after
    we additionally drop a leading "420" country code below."""
    if not phone:
        return ""
    digits = re.sub(r"\D+", "", phone)
    if digits.startswith("420") and len(digits) > 9:
        digits = digits[3:]
    return digits


def _normalize_name(first: str, last: str) -> str:
    """Lowercase + accent-fold + collapse whitespace. ASCII-only key
    so „Honza Dvořák" and „honza dvorak" match."""
    raw = f"{first or ''} {last or ''}".strip()
    if not raw:
        return ""
    decomposed = unicodedata.normalize("NFKD", raw)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", ascii_only.casefold()).strip()


def detect_duplicates(rsvps) -> dict[int, list[str]]:
    """Given an iterable of RSVPs (each with a `.user`), return a map
    {rsvp_id: [hint_code, …]} flagging rows that share a normalized
    phone or name with another row in the same set.

    The caller is responsible for scoping the input — typically all
    non-cancelled RSVPs on one event. RSVPs without a phone (anonymous
    flow where phone wasn't required) are skipped from the phone pass
    but still matched on name. RSVPs without a user are skipped
    entirely (defensive — shouldn't happen in practice).

    **Vyloučeni z detekce:**
      - Organizátoři (`is_organizer=True`) — owner se obvykle přidává s
        kontakty workspace-u (sdílený telefon, generic jméno) a falešný
        duplicate hint na vlastní řádku usera mate ("já mám taky příznak,
        to nechápu" — user report 2026-06-11). Organizátoři nepatří k
        participants-bucket, kde duplicate detection má sense.
      - RSVPs s `duplicate_dismissed=True` — owner explicitně klikl
        "ne, není to duplikát" (otec-syn případ).
    """
    phone_groups: dict[str, list[int]] = defaultdict(list)
    name_groups: dict[str, list[int]] = defaultdict(list)

    for r in rsvps:
        if r.user_id is None:
            continue
        if getattr(r, "is_organizer", False):
            continue
        if getattr(r, "duplicate_dismissed", False):
            continue
        user = r.user
        phone_key = _normalize_phone(user.phone or "")
        if phone_key:
            phone_groups[phone_key].append(r.id)
        name_key = _normalize_name(user.first_name, user.last_name)
        if name_key:
            name_groups[name_key].append(r.id)

    hints: dict[int, set[str]] = defaultdict(set)
    for ids in phone_groups.values():
        if len(ids) > 1:
            for rid in ids:
                hints[rid].add(HINT_SAME_PHONE)
    for ids in name_groups.values():
        if len(ids) > 1:
            for rid in ids:
                hints[rid].add(HINT_SAME_NAME)

    # Stable order — phone first (stronger signal), name second.
    order = [HINT_SAME_PHONE, HINT_SAME_NAME]
    return {
        rid: [code for code in order if code in codes]
        for rid, codes in hints.items()
    }
