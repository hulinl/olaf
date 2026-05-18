from rest_framework import serializers

from .models import Workspace


class WorkspaceWriteSerializer(serializers.ModelSerializer):
    """Owner-only update payload for /api/workspaces/{slug}/detail/ (PATCH).

    Slug + logo + cover are NOT writable here: slug change would break URLs +
    bookmarks; images go through their own upload endpoints so the form can
    do multipart and previews independently.
    """

    class Meta:
        model = Workspace
        fields = (
            "name",
            "bio",
            "location",
            "social_links",
            "accent_color",
            "visibility",
            "default_tz",
        )

    def validate_social_links(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("social_links must be an object.")
        cleaned: dict[str, str] = {}
        for k, v in value.items():
            if not isinstance(k, str) or not isinstance(v, str):
                raise serializers.ValidationError(
                    "social_links keys and values must be strings."
                )
            k = k.strip().lower()
            v = v.strip()
            if not k:
                continue
            cleaned[k] = v
        return cleaned

    def validate_accent_color(self, value):
        if not value:
            return ""
        if not value.startswith("#") or len(value) not in (4, 7):
            raise serializers.ValidationError("Použij hex barvu, např. #ffc719.")
        return value


class WorkspaceCreateSerializer(serializers.ModelSerializer):
    """Create-workspace payload. Slug must be set on create and is then
    immutable (validators in workspaces/validators.py enforce shape +
    reserved-paths blocking). Everything else has sensible defaults so the
    fresh-signup CTA can be a 2-field form (name + slug)."""

    class Meta:
        model = Workspace
        fields = (
            "slug",
            "name",
            "bio",
            "location",
            "visibility",
            "default_tz",
        )

    def validate_slug(self, value):
        from .validators import validate_workspace_slug

        try:
            validate_workspace_slug(value)
        except Exception as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if Workspace.objects.filter(slug=value).exists():
            raise serializers.ValidationError(
                "Komunita s tímto slugem už existuje."
            )
        return value


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
