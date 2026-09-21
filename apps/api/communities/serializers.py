"""DRF serializers for Communities + memberships."""
from __future__ import annotations

from rest_framework import serializers

from .models import Community, CommunityMember


class CommunitySerializer(serializers.ModelSerializer):
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    cover_url = serializers.SerializerMethodField()
    member_count = serializers.IntegerField(read_only=True)
    my_membership = serializers.SerializerMethodField()

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
            "my_membership",
            "created_at",
        )
        read_only_fields = (
            "id",
            "cover_url",
            "workspace_slug",
            "workspace_name",
            "member_count",
            "my_membership",
            "created_at",
        )

    def get_cover_url(self, obj: Community) -> str | None:
        return obj.cover.url if obj.cover else None

    def get_my_membership(self, obj: Community) -> dict | None:
        """Auth user's membership vůči této komunitě — používá to public
        stránka pro CTA (join / pending / member). None když anon nebo
        žádný row."""
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        row = CommunityMember.objects.filter(
            community=obj, user=request.user
        ).first()
        if row is None:
            return None
        return {"status": row.status, "role": row.role}


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
            "role",
            "joined_at",
            "decided_at",
            "user_email",
            "user_full_name",
        )
        read_only_fields = fields
