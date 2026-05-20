"""Czech-locale formatters shared across transactional e-mails.

Django's `date` filter resolves weekday/month names against the
process locale, which is English in this project (LANGUAGE_CODE="en")
because the admin + UI strings live in code. Rather than flip the
whole app to cs-cz just to render five e-mail dates, we ship one tiny
formatter and pass the pre-formatted string into template context.
"""
from __future__ import annotations

from datetime import datetime

_CZECH_WEEKDAYS = [
    "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle",
]


def format_event_dt(dt: datetime | None) -> str:
    """Returns e.g. "pátek 22. 5. 2026 v 14:00" or "" for None."""
    if dt is None:
        return ""
    weekday = _CZECH_WEEKDAYS[dt.weekday()]
    return f"{weekday} {dt.day}. {dt.month}. {dt.year} v {dt.hour}:{dt.minute:02d}"


def format_event_date(dt: datetime | None) -> str:
    """Date-only variant: "pátek 22. 5. 2026"."""
    if dt is None:
        return ""
    weekday = _CZECH_WEEKDAYS[dt.weekday()]
    return f"{weekday} {dt.day}. {dt.month}. {dt.year}"
