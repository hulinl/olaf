"""`audit.log()` — the one entry point call sites use.

Best-effort: an audit failure must never unwind the originating action.
We catch + log a warning rather than propagating, same pattern as the
notification fan-out helpers in events.notifications / discussions.emails.
"""
from __future__ import annotations

import contextlib
import logging
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.utils import timezone

from .models import AuditLog

if TYPE_CHECKING:
    from accounts.models import User
    from workspaces.models import Workspace

logger = logging.getLogger(__name__)

# Audit is append-only but unbounded growth would eventually slow the
# `/admin/audit` viewer. 18 months keeps two camp seasons of history
# (May-Sep cycle) - enough to retroactively spot anything that needs
# digging out. Bumpable per workspace later if anyone wants longer.
DEFAULT_RETENTION_DAYS = 18 * 30


def log(
    *,
    action: str,
    summary: str,
    actor: User | None = None,
    workspace: Workspace | None = None,
    target_type: str = "",
    target_id: Any = "",
    payload: dict | None = None,
) -> AuditLog | None:
    """Record one audit row. All kwargs — no positional args, the call
    sites read better that way. Returns the created row, or None when
    the write was swallowed by the safety net."""
    try:
        return AuditLog.objects.create(
            actor=actor,
            action=action,
            workspace=workspace,
            target_type=target_type or "",
            target_id=str(target_id) if target_id != "" else "",
            summary=summary,
            payload=payload or {},
        )
    except Exception:
        # Don't ever let the audit hook break the actual operation —
        # but make the failure visible in logs so we notice if it's
        # systematically broken (e.g., migration drift).
        logger.exception(
            "audit.log failed", extra={"action": action, "summary": summary}
        )
        with contextlib.suppress(Exception):
            return None
    return None


def purge_old(retention_days: int = DEFAULT_RETENTION_DAYS) -> int:
    """Hard-delete audit rows older than `retention_days`. Returns the
    count of rows removed. Idempotent — running twice in a day removes
    on the first call and is a no-op on the second."""
    cutoff = timezone.now() - timedelta(days=retention_days)
    qs = AuditLog.objects.filter(created_at__lt=cutoff)
    count = qs.count()
    if count:
        qs.delete()
    return count
