"""Template filters pro CZ-locale string transformations v e-mailech.

`czech_vocative` aplikuje skloňovací heuristiku z `notifications.vocative`
přímo v Django template, aby si call-site v emails.py nemusel
předzpracovávat user.first_name před passováním do contextu.
"""
from __future__ import annotations

from django import template

from ..vocative import to_czech_vocative

register = template.Library()


@register.filter(name="czech_vocative")
def czech_vocative(value: str | None) -> str:
    if not value:
        return value or ""
    return to_czech_vocative(str(value))
