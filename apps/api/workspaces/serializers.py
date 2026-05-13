from rest_framework import serializers

from .models import Workspace


class WorkspacePublicSerializer(serializers.ModelSerializer):
    """Public-facing workspace data — what `/api/workspaces/{slug}/` returns
    for `public` and `unlisted` visibility (anyone with the link).

    Communities and upcoming events come from later slices (3 + 4).
    """

    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = (
            "slug",
            "name",
            "bio",
            "location",
            "social_links",
            "accent_color",
            "logo_url",
            "cover_url",
            "visibility",
            "default_tz",
            "created_at",
        )
        read_only_fields = fields

    def get_logo_url(self, obj: Workspace) -> str | None:
        return obj.logo.url if obj.logo else None

    def get_cover_url(self, obj: Workspace) -> str | None:
        return obj.cover.url if obj.cover else None
