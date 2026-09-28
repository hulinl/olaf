"""Celery tasks — periodic re-fetch všech enabled personal calendar
sources. Beat schedule doporučen `every hour` pro dostatečnou čerstvost
bez zbytečného API loadu (Google Calendar iCal je stejně cached ~4h).
"""
from __future__ import annotations

from celery import shared_task

from .models import UserCalendarSource
from .services import sync_source


@shared_task
def refresh_all_sources() -> dict:
    """Sync všech enabled sources. Return souhrn pro monitoring."""
    ok_count = 0
    error_count = 0
    sources = UserCalendarSource.objects.filter(enabled=True)
    for source in sources:
        try:
            ok, _msg = sync_source(source)
        except Exception:
            ok = False
        if ok:
            ok_count += 1
        else:
            error_count += 1
    return {
        "total": sources.count(),
        "ok": ok_count,
        "errors": error_count,
    }


@shared_task
def refresh_single_source(source_id: int) -> dict:
    """Manuální trigger — např. po POST /sources/ pro immediate sync."""
    try:
        source = UserCalendarSource.objects.get(pk=source_id)
    except UserCalendarSource.DoesNotExist:
        return {"ok": False, "error": "source not found"}
    ok, msg = sync_source(source)
    return {"ok": ok, "message": msg}
