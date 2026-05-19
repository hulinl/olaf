"""Discussion threads attached to a Workspace (komunita) or an Event.

V1 design:
- Topic: title + body + pinned/locked flags + author + parent (workspace OR event).
- Comment: body + author + topic (flat, no nested replies).
- Visibility = "anyone who can see the parent" — checked by views, not
  by row-level filters here.

The parent link is a (type, id) pair instead of two nullable FKs so we
can index it cleanly and add new parent types (sub-community, group)
later without a schema migration per type.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class Topic(models.Model):
    """A thread / post on a komunita or event nástěnka."""

    PARENT_WORKSPACE = "workspace"
    PARENT_EVENT = "event"
    PARENT_CHOICES = [
        (PARENT_WORKSPACE, "Workspace"),
        (PARENT_EVENT, "Event"),
    ]

    parent_type = models.CharField(max_length=20, choices=PARENT_CHOICES)
    parent_id = models.PositiveIntegerField()

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="topics",
    )

    pinned = models.BooleanField(
        default=False,
        help_text="Pinned topics sort to the top of the feed.",
    )
    locked = models.BooleanField(
        default=False,
        help_text="Locked topics don't accept new comments.",
    )

    comment_count = models.PositiveIntegerField(
        default=0,
        help_text="Denormalised — kept in sync by Comment.save/delete.",
    )
    last_activity_at = models.DateTimeField(default=timezone.now)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "discussions_topic"
        ordering = ["-pinned", "-last_activity_at"]
        indexes = [
            models.Index(fields=["parent_type", "parent_id", "-last_activity_at"]),
        ]

    def __str__(self) -> str:
        return self.title


class Comment(models.Model):
    """A reply on a Topic. Flat threading in V1."""

    topic = models.ForeignKey(
        Topic, on_delete=models.CASCADE, related_name="comments"
    )
    body = models.TextField()
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="discussion_comments",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "discussions_comment"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["topic", "created_at"])]

    def __str__(self) -> str:
        return f"Comment #{self.pk} on {self.topic_id}"

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating:
            Topic.objects.filter(pk=self.topic_id).update(
                comment_count=models.F("comment_count") + 1,
                last_activity_at=timezone.now(),
            )

    def delete(self, *args, **kwargs):
        topic_id = self.topic_id
        super().delete(*args, **kwargs)
        Topic.objects.filter(pk=topic_id).update(
            comment_count=models.F("comment_count") - 1,
        )
