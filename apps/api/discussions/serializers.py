"""DRF serializers for the discussion wall."""
from __future__ import annotations

from rest_framework import serializers

from .models import Comment, Topic


def _author_avatar_payload(author, request) -> dict:
    """Common {url, focal_x, focal_y, zoom} block for author avatar.
    Returned inline v Topic/Comment serializerech aby frontend Avatar
    komponenta mohla renderovat bez zvláštního fetch. Prázdné pole
    (url="") = user nemá nahranou fotku → fallback na iniciály."""
    if author is None or not author.avatar:
        return {"url": "", "focal_x": 50.0, "focal_y": 50.0, "zoom": 100.0}
    url = author.avatar.url
    if request and url.startswith("/"):
        url = request.build_absolute_uri(url)
    return {
        "url": url,
        "focal_x": author.avatar_focal_x,
        "focal_y": author.avatar_focal_y,
        "zoom": author.avatar_zoom,
    }


class CommentSerializer(serializers.ModelSerializer):
    author_id = serializers.IntegerField(source="author.id", read_only=True)
    author_name = serializers.SerializerMethodField()
    author_email = serializers.CharField(
        source="author.email", read_only=True, default=""
    )
    author_avatar = serializers.SerializerMethodField()
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
            "author_avatar",
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
            "author_avatar",
            "like_count",
            "i_liked",
            "created_at",
            "updated_at",
        )

    def get_author_avatar(self, obj: Comment) -> dict:
        return _author_avatar_payload(obj.author, self.context.get("request"))

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
    author_avatar = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    i_liked = serializers.SerializerMethodField()
    # Inline preview posledních 2 top-level komentářů pro feed layout
    # 2026-09-10 (FB-style — nemusí se proklikávat do threadu). Frontend
    # feed karta zobrazuje tyto komentáře pod post body; expand button
    # dohledává zbytek přes TopicDetailSerializer. Chronologicky
    # (nejstarší -> nejnovější) pro přirozený feed čtení.
    recent_comments = serializers.SerializerMethodField()

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
            "author_avatar",
            "comment_count",
            "like_count",
            "i_liked",
            "recent_comments",
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
            "author_avatar",
            "comment_count",
            "like_count",
            "i_liked",
            "recent_comments",
            "last_activity_at",
            "created_at",
            "updated_at",
        )

    def get_recent_comments(self, obj: Topic) -> list[dict]:
        qs = (
            obj.comments.filter(parent__isnull=True)
            .select_related("author")
            .order_by("-created_at")[:2]
        )
        ordered = list(qs)[::-1]
        return CommentSerializer(
            ordered, many=True, context=self.context
        ).data

    def get_author_avatar(self, obj: Topic) -> dict:
        return _author_avatar_payload(obj.author, self.context.get("request"))

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
