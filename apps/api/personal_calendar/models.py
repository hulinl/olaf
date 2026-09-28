"""Personal calendar sources — Slice 5 vize „Časová osa" canvas.

User si připojí libovolný počet iCal URL feedů (Google Calendar,
Outlook, Apple, Fastmail…) a backend fetchne busy blocky, aby se
překryly nad race kalendářem na canvas view.

Privacy: obsah eventů (summary, location, description) se **nikam
neukládá**. Uložíme jen start/end datum + typ (all-day / timed) —
tzn. ostatním uživatelům komunity můžeme zobrazit „tenhle den je
Olaf busy" jen agregovaně přes API layer, nikdy detail.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class UserCalendarSource(models.Model):
    """Jeden iCal URL feed připojený k uživateli.

    Neukládáme content eventů — jen metadata pro re-fetch (URL, last
    sync, error state). Parsed busy blocks žijí v `busy_blocks`
    JSONField pro rychlé query bez join.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calendar_sources",
    )
    name = models.CharField(
        max_length=100,
        help_text='Přátelský název (např. „Pracovní Google", „Rodinný Apple").',
    )
    ical_url = models.URLField(
        max_length=1000,
        help_text=(
            "Public iCal URL. Google Calendar Settings → Secret address in "
            "iCal format. Outlook: Settings → Shared calendars → Publish."
        ),
    )
    enabled = models.BooleanField(
        default=True,
        help_text="Vypnuté zdroje se nefetchují ani nezobrazují na canvasu.",
    )
    color = models.CharField(
        max_length=7,
        default="#0284c7",
        help_text="Hex color pro rozlišení zdrojů na canvasu (per user).",
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(
        blank=True,
        default="",
        help_text="Chybová hláška z posledního fetch, '' = OK.",
    )
    # Cached parsed busy blocks. Format:
    # [{"starts": "2027-01-15T10:00:00Z", "ends": "2027-01-15T12:00:00Z",
    #   "all_day": false}, ...]
    # No summary/location — privacy. Re-fetch přepíše celý list.
    busy_blocks = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "personal_calendar_source"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["user", "enabled"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}: {self.name}"
