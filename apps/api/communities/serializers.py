"""DRF serializers for Communities + memberships."""
from __future__ import annotations

from rest_framework import serializers

from .models import Community, CommunityMember


class CommunitySerializer(serializers.ModelSerializer):
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    cover_url = serializers.SerializerMethodField()
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Community
        fields = (
            "id",
            "slug",
            "name",
            "description",
            "cover_url",
            "visibility",
            "membership_policy",
            "workspace_slug",
            "workspace_name",
            "member_count",
            "created_at",
        )
        read_only_fields = (
            "id",
            "cover_url",
            "workspace_slug",
            "workspace_name",
            "member_count",
            "created_at",
        )

    def get_cover_url(self, obj: Community) -> str | None:
        return obj.cover.url if obj.cover else None


class CommunityMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(
        source="user.get_full_name", read_only=True
    )

    class Meta:
        model = CommunityMember
        fields = (
            "id",
            "status",
            "joined_at",
            "decided_at",
            "user_email",
            "user_full_name",
        )
        read_only_fields = fields
