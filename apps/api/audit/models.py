"""Audit log — append-only history of high-signal actions.

Goal is "who did what, when" for owner-shell review. NOT a security
forensics tool — we don't log reads, we don't capture IPs, we don't
sign rows. If we ever need that, it's a separate table.

Targets are stored as `(target_type, target_id)` strings rather than a
GenericForeignKey. ContentTypes makes querying clunkier (need ct id
joins) and the audit row should survive even if the original target
is hard-deleted.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    """One row per recorded action. Written by `audit.log()` from the
    call site of the action (not by signals — signals make it too
    easy to record duplicates or miss context like the reason)."""

    # Common action codes. Free-text — we don't lock this to a choices
    # list because new modules add new codes constantly and the audit
    # viewer is fine with showing whatever string we wrote.
    ACTION_EVENT_SOFT_DELETE = "event.soft_delete"
    ACTION_EVENT_RESTORE = "event.restore"
    ACTION_EVENT_PURGE = "event.purge"
    ACTION_EVENT_CANCEL = "event.cancel"
    ACTION_EVENT_UPDATE = "event.update"
    ACTION_RSVP_APPROVE = "rsvp.approve"
    ACTION_RSVP_REJECT = "rsvp.reject"
    ACTION_MEMBER_ROLE_CHANGE = "workspace_member.role_change"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text=(
            "Who performed the action. NULL when the action was a "
            "system/cron event (e.g., scheduled hard-purge) or when "
            "the user has since been deleted."
        ),
    )
    action = models.CharField(
        max_length=80,
        db_index=True,
        help_text="Dotted action code, e.g. `event.soft_delete`.",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text=(
            "Tenant scope. NULL only for cross-tenant or platform-"
            "wide actions (none today). Used as the filter axis for "
            "the /admin/audit viewer."
        ),
    )
    target_type = models.CharField(
        max_length=40,
        blank=True,
        default="",
        help_text="`event`, `rsvp`, `workspace_member`, …",
    )
    target_id = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text=(
            "PK of the target row, stored as a string so we can hold "
            "ints, uuids, or composite keys without schema gymnastics."
        ),
    )
    summary = models.CharField(
        max_length=300,
        help_text=(
            'Czech one-liner for the audit feed. Format: actor-less '
            'verb-first sentence, e.g. „Smazal akci Spring Camp".'
        ),
    )
    payload = models.JSONField(
        blank=True,
        default=dict,
        help_text=(
            "Structured context — e.g. for `event.update`, the list "
            "of changed fields and their before/after values."
        ),
    )
    created_at = models.DateTimeField(
        default=timezone.now,
        db_index=True,
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=("workspace", "-created_at"),
                name="audit_ws_created_idx",
            ),
            models.Index(
                fields=("target_type", "target_id"),
                name="audit_target_idx",
            ),
        ]

    def __str__(self) -> str:
        actor = self.actor.get_full_name() if self.actor else "system"
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {actor} {self.action}"
