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

    class Meta:
        model = Comment
        fields = (
            "id",
            "topic",
            "body",
            "author_id",
            "author_name",
            "author_email",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "topic",
            "author_id",
            "author_name",
            "author_email",
            "created_at",
            "updated_at",
        )

    def get_author_name(self, obj: Comment) -> str:
        if obj.author is None:
            return "[smazaný uživatel]"
        return obj.author.get_full_name() or obj.author.email


class TopicSerializer(serializers.ModelSerializer):
    author_id = serializers.IntegerField(source="author.id", read_only=True)
    author_name = serializers.SerializerMethodField()

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
            "last_activity_at",
            "created_at",
            "updated_at",
        )

    def get_author_name(self, obj: Topic) -> str:
        if obj.author is None:
            return "[smazaný uživatel]"
        return obj.author.get_full_name() or obj.author.email


class TopicDetailSerializer(TopicSerializer):
    """Topic + inlined comments — used by GET on a single topic so the
    frontend can render the thread in one round-trip."""

    comments = CommentSerializer(many=True, read_only=True)

    class Meta(TopicSerializer.Meta):
        fields = (*TopicSerializer.Meta.fields, "comments")
        read_only_fields = (*TopicSerializer.Meta.read_only_fields, "comments")
