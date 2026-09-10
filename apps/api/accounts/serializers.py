import re

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User

PASSWORD_LETTER_RE = re.compile(r"[A-Za-z]")
PASSWORD_DIGIT_RE = re.compile(r"\d")


def _validate_olaf_password(value: str) -> str:
    """PRD §4.1: min 10 chars, ≥1 letter, ≥1 digit, on top of Django validators."""
    if len(value) < 10:
        raise serializers.ValidationError("Password must be at least 10 characters long.")
    if not PASSWORD_LETTER_RE.search(value):
        raise serializers.ValidationError("Password must contain at least one letter.")
    if not PASSWORD_DIGIT_RE.search(value):
        raise serializers.ValidationError("Password must contain at least one digit.")
    validate_password(value)
    return value


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[_validate_olaf_password])
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        # Existující VERIFIED user → klasická chyba "Účet už existuje,
        # přihlas se." Existující UNVERIFIED user (= guest po anon RSVP)
        # signup naopak nesmí blokovat — view ten případ rozpozná a
        # převezme existující row místo aby tvořil duplikát. Bez tohohle
        # by guest user uvízl mezi: "Tvůj e-mail je v DB, ale nemůžeš se
        # přihlásit ani signupnout."
        value = value.lower().strip()
        existing = User.objects.filter(email=value).first()
        if existing and existing.email_verified:
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[_validate_olaf_password])


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    profile_completion = serializers.ReadOnlyField()
    # `avatar` ImageField vrací URL přes storage backend — v dev relativní
    # `/media/avatars/...`, v prod absolutní Azure Blob URL. Read-only —
    # upload jede přes separátní multipart endpoint `/api/auth/me/avatar/`.
    avatar_url = serializers.SerializerMethodField()
    # Focal + zoom clampneme na serverem přijaté rozsahy — frontend
    # PhotoEditor zaručuje 0-100 %/100-300 %, ale rogue klient by mohl
    # poslat cokoli. Serializer validators drží data v mezích.
    avatar_focal_x = serializers.FloatField(min_value=0, max_value=100, required=False)
    avatar_focal_y = serializers.FloatField(min_value=0, max_value=100, required=False)
    avatar_zoom = serializers.FloatField(min_value=100, max_value=300, required=False)

    def get_avatar_url(self, obj) -> str:
        if not obj.avatar:
            return ""
        request = self.context.get("request")
        url = obj.avatar.url
        if request and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "full_name",
            "phone",
            "profile_completion",
            "dob",
            "avatar_blob_id",
            "avatar_url",
            "avatar_focal_x",
            "avatar_focal_y",
            "avatar_zoom",
            "profile_show_email",
            "profile_show_phone",
            "profile_show_address",
            "profile_show_avatar",
            "address",
            # Structured address (V1 invoice prep)
            "address_street",
            "address_city",
            "address_zip",
            "address_country",
            "has_billing_address",
            "billing_name",
            "billing_ico",
            "billing_dic",
            "billing_street",
            "billing_city",
            "billing_zip",
            "billing_country",
            # Activity & performance
            "fitness_level",
            "fitness_note",
            "pace_10k",
            "weekly_km",
            "longest_run",
            "sport_tags",
            "bio",
            # Diet
            "diet",
            "diet_note",
            # Apparel
            "tshirt_size",
            # Emergency contact
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relationship",
            # Notifications
            "notify_on_discussion_reply",
            "notify_on_discussion_announce",
            "notify_on_discussion_mention",
            "notify_on_event_update",
            "notify_on_rsvp_status",
            # Gear affiliate partners
            "affiliate_partners",
            # System
            "email_verified",
            "date_joined",
        )
        read_only_fields = ("id", "email", "email_verified", "date_joined")


class UserPublicProfileSerializer(serializers.ModelSerializer):
    """Payload pro `/u/<id>` public profile view. Respektuje user's
    `profile_show_*` toggles — pole, která user schoval, vrátíme jako
    prázdné stringy (`""`) nebo `null` (avatar_url). Konzumenti mají
    respektovat prázdnou hodnotu jako „nezveřejněno".

    **Organizer bypass**: když je viewer organizátor akce, na které je
    target user zaregistrovaný (RSVP non-cancelled), toggles obcházíme
    a vrátíme vše. User request 2026-09-10 — organizátor musí vidět
    kompletní kontakt u účastníků svých akcí.
    """

    full_name = serializers.CharField(source="get_full_name", read_only=True)
    avatar_url = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    address_street = serializers.SerializerMethodField()
    address_city = serializers.SerializerMethodField()
    address_zip = serializers.SerializerMethodField()
    address_country = serializers.SerializerMethodField()
    # Read-only signál pro frontend: `bypassed=True` = viewer je
    # organizátor nad tímto účastníkem, takže vidí vše bez ohledu na
    # target toggles. UI si pak ukáže badge „Vidíš jako pořadatel".
    organizer_bypass = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "first_name",
            "last_name",
            "display_name",
            "full_name",
            "bio",
            "avatar_url",
            "avatar_focal_x",
            "avatar_focal_y",
            "avatar_zoom",
            "email",
            "phone",
            "address_street",
            "address_city",
            "address_zip",
            "address_country",
            "organizer_bypass",
        )
        read_only_fields = fields

    def _bypasses_toggles(self, obj: User) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if request.user.pk == obj.pk:
            # User vidí vlastní profil kompletně.
            return True
        # Organizátor akce, na které je target přihlášený.
        from events.models import RSVP
        from workspaces.models import WorkspaceMember

        # Workspaces, ve kterých je viewer owner/admin.
        managed_workspace_ids = list(
            WorkspaceMember.objects.filter(
                user=request.user,
                role__in=[
                    WorkspaceMember.ROLE_OWNER,
                    WorkspaceMember.ROLE_ADMIN,
                ],
            ).values_list("workspace_id", flat=True)
        )
        if not managed_workspace_ids:
            return False
        return RSVP.objects.filter(
            user=obj,
            event__workspace_id__in=managed_workspace_ids,
        ).exclude(status=RSVP.STATUS_CANCELLED).exists()

    def get_organizer_bypass(self, obj: User) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if request.user.pk == obj.pk:
            return False  # own profile — nebypass, ale všechno vidím tak jako tak
        return self._bypasses_toggles(obj)

    def _absolute_avatar_url(self, obj: User) -> str:
        if not obj.avatar:
            return ""
        request = self.context.get("request")
        url = obj.avatar.url
        if request and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url

    def get_avatar_url(self, obj: User) -> str:
        if not obj.profile_show_avatar and not self._bypasses_toggles(obj):
            return ""
        return self._absolute_avatar_url(obj)

    def get_email(self, obj: User) -> str:
        if not obj.profile_show_email and not self._bypasses_toggles(obj):
            return ""
        return obj.email

    def get_phone(self, obj: User) -> str:
        if not obj.profile_show_phone and not self._bypasses_toggles(obj):
            return ""
        return obj.phone or ""

    def _address_field(self, obj: User, field: str) -> str:
        if not obj.profile_show_address and not self._bypasses_toggles(obj):
            return ""
        return getattr(obj, field, "") or ""

    def get_address_street(self, obj: User) -> str:
        return self._address_field(obj, "address_street")

    def get_address_city(self, obj: User) -> str:
        return self._address_field(obj, "address_city")

    def get_address_zip(self, obj: User) -> str:
        return self._address_field(obj, "address_zip")

    def get_address_country(self, obj: User) -> str:
        return self._address_field(obj, "address_country")


from .models import BillingProfile  # noqa: E402


class BillingProfileSerializer(serializers.ModelSerializer):
    """Creator-side billing identity (Dodavatel on invoices)."""

    class Meta:
        model = BillingProfile
        fields = (
            "id",
            "label",
            "legal_name",
            "ico",
            "dic",
            "address_street",
            "address_city",
            "address_zip",
            "address_country",
            "iban",
            "bank_name",
            "is_default",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
