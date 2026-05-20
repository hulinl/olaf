"""DRF serializers for the discussion wall."""
from __future__ import annotations

from rest_framework import serializers

from .models import Comment, Topic


class CommentSerializer(serializers.ModelSerializer):
    author_id = serializers.IntegerField(source="author.id", read_only=True)
    author_name = serializers.SerializerMethodField()
    author_email = serializers.CharField(
        source="author.email", read_only=True, default=""
    )
    like_count = serializers.SerializerMethodField()
    i_liked = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = (
            "id",
            "topic",
            "parent",
            "body",
            "attachment_url",
            "attachment_name",
            "author_id",
            "author_name",
            "author_email",
            "like_count",
            "i_liked",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "topic",
            "attachment_url",
            "attachment_name",
            "author_id",
            "author_name",
            "author_email",
            "like_count",
            "i_liked",
            "created_at",
            "updated_at",
        )

    def get_attachment_url(self, obj: Comment) -> str | None:
        return obj.image.url if obj.image else None

    def get_attachment_name(self, obj: Comment) -> str:
        """Basename of the uploaded file — UI uses it as the download
        link label for non-image attachments."""
        if not obj.image:
            return ""
        import os

        return os.path.basename(obj.image.name)

    def get_author_name(self, obj: Comment) -> str:
        if obj.author is None:
            return "[smazaný uživatel]"
        return obj.author.get_full_name() or obj.author.email

    def get_like_count(self, obj: Comment) -> int:
        return obj.likes.count()

    def get_i_liked(self, obj: Comment) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class TopicSerializer(serializers.ModelSerializer):
    author_id = serializers.IntegerField(source="author.id", read_only=True)
    author_name = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    i_liked = serializers.SerializerMethodField()

    class Meta:
        model = Topic
        fields = (
            "id",
            "parent_type",
            "parent_id",
            "title",
            "body",
            "pinned",
            "locked",
            "author_id",
            "author_name",
            "comment_count",
            "like_count",
            "i_liked",
            "last_activity_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "parent_type",
            "parent_id",
            "author_id",
            "author_name",
            "comment_count",
            "like_count",
            "i_liked",
            "last_activity_at",
            "created_at",
            "updated_at",
        )

    def get_author_name(self, obj: Topic) -> str:
        if obj.author is None:
            return "[smazaný uživatel]"
        return obj.author.get_full_name() or obj.author.email

    def get_like_count(self, obj: Topic) -> int:
        # Prefer the annotated value (avoids N+1 from list views) and
        # fall back to a per-row count.
        cached = getattr(obj, "_like_count", None)
        if cached is not None:
            return int(cached)
        return obj.likes.count()

    def get_i_liked(self, obj: Topic) -> bool:
        cached = getattr(obj, "_i_liked", None)
        if cached is not None:
            return bool(cached)
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class TopicDetailSerializer(TopicSerializer):
    """Topic + inlined comments — used by GET on a single topic so the
    frontend can render the thread in one round-trip."""

    comments = CommentSerializer(many=True, read_only=True)

    class Meta(TopicSerializer.Meta):
        fields = (*TopicSerializer.Meta.fields, "comments")
        read_only_fields = (*TopicSerializer.Meta.read_only_fields, "comments")
