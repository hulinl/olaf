from rest_framework import serializers

from .models import Workspace, WorkspaceMember


class WorkspaceWriteSerializer(serializers.ModelSerializer):
    """Owner-only update payload for /api/workspaces/{slug}/detail/ (PATCH).

    Slug + logo + cover are NOT writable here: slug change would break URLs +
    bookmarks; images go through their own upload endpoints so the form can
    do multipart and previews independently.

    Cover focal + zoom ale písatelné jsou — jsou to metadata na existující
    fotce, ne binární upload. Editor UI je nakonci flushne přes běžný
    profile-save.
    """

    # Range 0-100 pro focal (% v ose), 100-300 pro zoom - matchuje
    # `accounts.UserSerializer` a limity PhotoEditor komponenty.
    cover_focal_x = serializers.FloatField(min_value=0, max_value=100, required=False)
    cover_focal_y = serializers.FloatField(min_value=0, max_value=100, required=False)
    cover_zoom = serializers.FloatField(min_value=100, max_value=300, required=False)

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
            "cover_focal_x",
            "cover_focal_y",
            "cover_zoom",
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
    # Viewerův vztah k workspace — public join CTA na landing potřebuje
    # vědět, jestli je requester už člen, čeká na schválení, nebo
    # nikdo. `null` pro anon i pro plně cizí authenticated usery.
    my_membership = serializers.SerializerMethodField()
    # Owner ("kdo komunitu vede") — public landing má sekci s Avatar +
    # jménem + linkem na /u/<slug>. Vrací první owner-role active
    # membera; když nemá (zbytkové edge případy), `null`.
    owner = serializers.SerializerMethodField()

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
            "cover_focal_x",
            "cover_focal_y",
            "cover_zoom",
            "visibility",
            "default_tz",
            "payment_iban",
            "payment_bank_name",
            "payment_due_days",
            "event_sharing_policy",
            "created_at",
            "my_membership",
            "owner",
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

    def get_my_membership(self, obj: Workspace) -> dict | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        m = WorkspaceMember.objects.filter(
            workspace=obj, user=request.user
        ).first()
        if m is None:
            return None
        return {"status": m.status, "role": m.role}

    def get_owner(self, obj: Workspace) -> dict | None:
        """"Kdo vede komunitu" — první owner-role active member; pokud
        neexistuje, fallneme na admina. (Některé workspace založené z
        Notion importu nebo dřívějších migrací nemají explicit owner
        row, ale mají admina, který komunitu spravuje.)

        Vrací minimální payload pro landing sekci: display info + link
        na /u/<slug>. Kontakty (email, phone) tady neexposujeme — pro
        soukromí by je user musel explicitně zveřejnit přes public
        profile toggles. Public landing pošle usera na /u/<slug>, kde
        UserPublicProfileSerializer respektuje `profile_show_*` toggles.
        """
        from django.db.models import Case, IntegerField, When

        m = (
            WorkspaceMember.objects.filter(
                workspace=obj,
                status=WorkspaceMember.STATUS_ACTIVE,
                role__in=[
                    WorkspaceMember.ROLE_OWNER,
                    WorkspaceMember.ROLE_ADMIN,
                ],
            )
            .select_related("user")
            .annotate(
                _prio=Case(
                    When(role=WorkspaceMember.ROLE_OWNER, then=0),
                    default=1,
                    output_field=IntegerField(),
                ),
            )
            .order_by("_prio", "created_at")
            .first()
        )
        if m is None or m.user is None:
            return None
        u = m.user
        return {
            "id": u.pk,
            "profile_slug": u.profile_slug or "",
            "first_name": u.first_name,
            "last_name": u.last_name,
            "display_name": u.display_name,
            "full_name": u.get_full_name(),
            "bio": u.bio,
            "avatar_url": u.avatar.url if u.avatar else None,
            "avatar_focal_x": u.avatar_focal_x,
            "avatar_focal_y": u.avatar_focal_y,
            "avatar_zoom": u.avatar_zoom,
        }
