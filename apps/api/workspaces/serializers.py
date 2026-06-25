from rest_framework import serializers

from .models import Workspace, WorkspaceMember


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
            "payment_iban",
            "payment_bank_name",
            "payment_due_days",
            "event_sharing_policy",
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
    # social_links nesmí leak-ovat e-mail adresu — public stránka
    # používá kontaktní formulář (POST /contact/), e-mail zůstává
    # serverside. Místo `email` exposujeme jen flag `has_contact_form`.
    social_links = serializers.SerializerMethodField()
    has_contact_form = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = (
            "slug",
            "name",
            "bio",
            "location",
            "social_links",
            "has_contact_form",
            "accent_color",
            "logo_url",
            "cover_url",
            "visibility",
            "default_tz",
            "payment_iban",
            "payment_bank_name",
            "payment_due_days",
            "event_sharing_policy",
            "created_at",
        )
        read_only_fields = fields

    def get_logo_url(self, obj: Workspace) -> str | None:
        return obj.logo.url if obj.logo else None

    def get_cover_url(self, obj: Workspace) -> str | None:
        return obj.cover.url if obj.cover else None

    def get_social_links(self, obj: Workspace) -> dict:
        # Stripneme `email` z public response — bot scraper to nestáhne.
        # Owner (čte přes /detail/) e-mail vidí, jinak ho nahrazuje
        # contact-form flag.
        links = obj.social_links or {}
        request = self.context.get("request")
        viewer_is_owner = False
        if request and request.user.is_authenticated:
            viewer_is_owner = WorkspaceMember.objects.filter(
                workspace=obj,
                user=request.user,
                role__in=[
                    WorkspaceMember.ROLE_OWNER,
                    WorkspaceMember.ROLE_ADMIN,
                ],
            ).exists()
        return {
            k: v
            for k, v in links.items()
            if v and (viewer_is_owner or k != "email")
        }

    def get_has_contact_form(self, obj: Workspace) -> bool:
        # True iff má email v social_links → ContactFormDialog se na
        # public stránce zobrazí jako "Napsat komunitě" tlačítko.
        return bool((obj.social_links or {}).get("email"))
