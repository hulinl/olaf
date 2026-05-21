"""Per-user notification feed model.

The notification feed is the bell-with-counter affordance in the
top-right of the app. Each row represents one thing the user might
want to know about — a reply on their topic, a mention in a
comment, an event they RSVPed to was updated, etc.

Slice 1 ships just the model + REST API. Slice 2 will wire fan-out
triggers from existing endpoints (discussions, events) to actually
create rows.

`kind` is a free-text discriminator so we can ship new notification
types without a migration; the frontend renders each kind from the
`title` + `body` strings the backend already formatted, so adding a
kind doesn't require a frontend change either.

`link` is a relative frontend URL — clicking the notification in
the bell dropdown navigates there. `payload` holds kind-specific
structured data (topic_id, event_slug, mention_in_comment_id, …)
for callers that need to act on it programmatically.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    # Common kinds. Free-text so adding new ones is a no-migration
    # change; constants here are just hint-style references for the
    # backend fan-out code.
    KIND_DISCUSSION_REPLY = "discussion_reply"
    KIND_DISCUSSION_ANNOUNCE = "discussion_announce"
    KIND_DISCUSSION_MENTION = "discussion_mention"
    KIND_EVENT_UPDATE = "event_update"
    KIND_RSVP_APPROVED = "rsvp_approved"
    KIND_RSVP_REJECTED = "rsvp_rejected"
    KIND_PAYMENT_RECEIVED = "payment_received"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    kind = models.CharField(
        max_length=40,
        db_index=True,
        help_text="Discriminator — see KIND_* constants for known values.",
    )
    title = models.CharField(
        max_length=200,
        help_text=(
            "Short one-line summary shown in the bell dropdown. "
            "Pre-formatted by the backend (incl. actor name etc.)."
        ),
    )
    body = models.TextField(
        blank=True,
        default="",
        help_text="Optional longer text for the expanded view.",
    )
    link = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text=(
            "Relative frontend URL to navigate to on click "
            "(e.g. /events/ws/event/?tab=nastenka#topic-42)."
        ),
    )
    payload = models.JSONField(
        blank=True,
        default=dict,
        help_text="Kind-specific structured data (topic_id, event_slug, ...).",
    )
    read_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Null = unread.",
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "notifications_notification"
        ordering = ["-created_at"]
        indexes = [
            # The bell badge query — unread for this user, newest first.
            models.Index(fields=["recipient", "read_at", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.recipient_id}: {self.kind} → {self.title[:40]}"

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def mark_read(self) -> None:
        if self.read_at is None:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at"])
