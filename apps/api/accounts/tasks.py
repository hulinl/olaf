"""Celery tasks for the accounts app.

Nudge stuck users tak, aby dokončili verifikaci e-mailu — jinak
odcházejí (viz user report 2026-09-11, uchytil.pavel@email.cz).

Task se registruje jako periodic přes django_celery_beat migraci
0018_periodic_notify_stuck_users, spouští se 1x denně.
"""
from __future__ import annotations

from celery import shared_task
from django.core.management import call_command


@shared_task(name="accounts.notify_stuck_users")
def notify_stuck_users_task() -> None:
    """Wrapper kolem management command tak, aby ho beat scheduler
    uměl volat. Command samotný obsahuje veškerou logiku (dedup přes
    cooldown, opt-out přes has_usable_password etc.)."""
    call_command("notify_stuck_users")
