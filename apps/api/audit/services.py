"""`audit.log()` — the one entry point call sites use.

Best-effort: an audit failure must never unwind the originating action.
We catch + log a warning rather than propagating, same pattern as the
notification fan-out helpers in events.notifications / discussions.emails.
"""
from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING, Any

from .models import AuditLog

if TYPE_CHECKING:
    from accounts.models import User
    from workspaces.models import Workspace

logger = logging.getLogger(__name__)


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
