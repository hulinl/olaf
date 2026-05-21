"""Audit Celery tasks.

Currently just retention pruning. The actual `audit.log` write is
synchronous from the call site — running it through a queue would
defeat the "stays consistent with the originating txn" property.
"""
from __future__ import annotations

from celery import shared_task

from .services import DEFAULT_RETENTION_DAYS, purge_old


@shared_task(name="audit.purge_old")
def purge_old_audit_rows_task(
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> dict[str, int]:
    """Cron-trigger for the retention purge — runs daily from beat.
    Param is exposed so tests + ad-hoc invocations can override
    without touching the default."""
    purged = purge_old(retention_days=retention_days)
    return {"purged": purged}
