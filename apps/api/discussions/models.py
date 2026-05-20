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
    """A reply on a Topic. Single-level threading: a comment may point
    at another comment via `parent`, and we render replies indented
    underneath their parent. We deliberately don't allow reply-to-a-
    reply (would balloon into deeply nested trees) — clicking Reply on
    a nested comment still attaches the new comment to the top-level
    parent."""

    topic = models.ForeignKey(
        Topic, on_delete=models.CASCADE, related_name="comments"
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    body = models.TextField()
    # Renamed in spirit from "image" to "attachment" — keep the DB
    # column name for migration simplicity, but the field accepts any
    # file (photo from mobile gallery, file picker on desktop, etc.).
    # The serializer adds detection so images still render inline.
    image = models.FileField(
        upload_to="discussions/comments/",
        blank=True,
        null=True,
        help_text="Optional file attached to the comment (image or other).",
    )
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


class TopicLike(models.Model):
    """One user's "like" on one topic. Stored as a row rather than a
    counter so we can show who liked a post (V1.5) without rebuilding
    the schema.
    """

    topic = models.ForeignKey(
        Topic, on_delete=models.CASCADE, related_name="likes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="topic_likes",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "discussions_topic_like"
        constraints = [
            models.UniqueConstraint(
                fields=["topic", "user"], name="uniq_topic_like_per_user"
            ),
        ]
        indexes = [models.Index(fields=["topic", "created_at"])]

    def __str__(self) -> str:
        return f"Like by {self.user_id} on topic {self.topic_id}"


class CommentLike(models.Model):
    """One user's "like" on one comment. Same shape as TopicLike — the
    UI shows ❤︎ + count per comment so people can react without writing
    another comment."""

    comment = models.ForeignKey(
        Comment, on_delete=models.CASCADE, related_name="likes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_likes",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "discussions_comment_like"
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "user"], name="uniq_comment_like_per_user"
            ),
        ]
        indexes = [models.Index(fields=["comment", "created_at"])]

    def __str__(self) -> str:
        return f"Like by {self.user_id} on comment {self.comment_id}"
