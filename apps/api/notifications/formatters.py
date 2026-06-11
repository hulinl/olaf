"""Czech-locale formatters shared across transactional e-mails.

Django's `date` filter resolves weekday/month names against the
process locale, which is English in this project (LANGUAGE_CODE="en")
because the admin + UI strings live in code. Rather než flip the
whole app to cs-cz just to render five e-mail dates, we ship one tiny
formatter and pass the pre-formatted string into template context.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

_CZECH_WEEKDAYS = [
    "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle",
]


def _localize(dt: datetime, tz: str | None) -> datetime:
    """Vrátí dt přepnuté do `tz` zóny. `event.starts_at` ukládáme jako
    UTC; bez explicitní konverze by formatter ukazoval 16:00 místo
    18:00 v letním čase. `tz=None` zachová původní zóny (interpretuje
    se jako "nech tak, jak je"). Neznámou tz mlčky padáme zpět na UTC
    + warning do logu — chybu konfigurace nechceme nikdy hodit do
    e-mailu uživateli."""
    if not tz:
        return dt
    try:
        return dt.astimezone(ZoneInfo(tz))
    except ZoneInfoNotFoundError:
        logger.warning("Unknown timezone %r — falling back to UTC", tz)
        return dt


def format_event_dt(dt: datetime | None, tz: str | None = None) -> str:
    """Returns e.g. "pátek 22. 5. 2026 v 14:00" or "" for None.

    `tz` je IANA jméno (např. `Europe/Prague`) — typically
    `event.tz`. Bez něj formátujeme v původní zóně, což u
    UTC-stored datetime znamená UTC čas.
    """
    if dt is None:
        return ""
    dt = _localize(dt, tz)
    weekday = _CZECH_WEEKDAYS[dt.weekday()]
    return f"{weekday} {dt.day}. {dt.month}. {dt.year} v {dt.hour}:{dt.minute:02d}"


def format_event_date(dt: datetime | None, tz: str | None = None) -> str:
    """Date-only variant: "pátek 22. 5. 2026"."""
    if dt is None:
        return ""
    dt = _localize(dt, tz)
    weekday = _CZECH_WEEKDAYS[dt.weekday()]
    return f"{weekday} {dt.day}. {dt.month}. {dt.year}"


def format_payment_due(
    created_at: datetime | None,
    due_days: int | None,
) -> str:
    """Concrete payment-due date — eg "do pátek 5. 6. 2026".

    Replaces the vague "X dní od registrace", which forced the user to
    compute the date themselves. Empty string if either input is missing
    or due_days <= 0 (= immediate / N/A).
    """
    if created_at is None or not due_days or due_days <= 0:
        return ""
    due = created_at + timedelta(days=due_days)
    return f"do {format_event_date(due)}"
