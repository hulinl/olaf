"""DRF serializers for events + RSVPs."""
from __future__ import annotations

from rest_framework import serializers

from .models import RSVP, Event

# Max-set questionnaire fields. Owner picks which sections appear on RSVP via
# Event.enabled_questionnaire_sections; serializer below validates dynamically.

T_SHIRT_SIZES = ("XS", "S", "M", "L", "XL", "XXL")
DIET_OPTIONS = ("omnivore", "vegetarian", "vegan", "other")
FITNESS_OPTIONS = ("beginner", "intermediate", "advanced")

# Section → list of question keys that section covers.
SECTION_FIELDS: dict[str, list[str]] = {
    "tshirt_size": ["tshirt_size"],
    "diet": ["diet", "diet_note"],
    "fitness": [
        "fitness_level",
        "fitness_note",
        "pace_10k",
        "weekly_km",
        "longest_run",
    ],
    "health_notes": ["health_notes"],
    "emergency_contact": [
        "emergency_contact_name",
        "emergency_contact_phone",
    ],
    "photo_consent": ["photo_consent"],
}


def build_questionnaire_serializer(enabled_sections: list[str]):
    """Return a Serializer class that validates only the enabled sections.

    Fields outside enabled sections are silently dropped from the payload so a
    stale client posting full data doesn't get rejected, but their values are
    not persisted.
    """

    enabled = set(enabled_sections or list(SECTION_FIELDS.keys()))
    allowed_fields: set[str] = set()
    for s, fields in SECTION_FIELDS.items():
        if s in enabled:
            allowed_fields.update(fields)

    class _Dynamic(serializers.Serializer):
        # Define all fields; we'll trim in __init__.
        tshirt_size = serializers.ChoiceField(
            choices=T_SHIRT_SIZES, required=False, allow_blank=True
        )
        diet = serializers.ChoiceField(
            choices=DIET_OPTIONS, required=False, allow_blank=True
        )
        diet_note = serializers.CharField(
            max_length=400, required=False, allow_blank=True
        )
        fitness_level = serializers.ChoiceField(
            choices=FITNESS_OPTIONS, required=False, allow_blank=True
        )
        fitness_note = serializers.CharField(
            max_length=500, required=False, allow_blank=True
        )
        pace_10k = serializers.CharField(
            max_length=20, required=False, allow_blank=True
        )
        weekly_km = serializers.IntegerField(
            required=False, allow_null=True, min_value=0
        )
        longest_run = serializers.CharField(
            max_length=50, required=False, allow_blank=True
        )
        health_notes = serializers.CharField(
            max_length=1000, required=False, allow_blank=True
        )
        emergency_contact_name = serializers.CharField(
            max_length=200, required=False, allow_blank=True
        )
        emergency_contact_phone = serializers.CharField(
            max_length=30, required=False, allow_blank=True
        )
        photo_consent = serializers.BooleanField(required=False, default=False)

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            for key in list(self.fields.keys()):
                if key not in allowed_fields:
                    self.fields.pop(key)
                    continue
                # Make section-required fields required again.
                if key in {
                    "tshirt_size",
                    "diet",
                    "fitness_level",
                    "emergency_contact_name",
                    "emergency_contact_phone",
                    "photo_consent",
                }:
                    self.fields[key].required = True
                    if hasattr(self.fields[key], "allow_blank"):
                        self.fields[key].allow_blank = False

        def validate(self, attrs):
            if (
                "diet" in allowed_fields
                and attrs.get("diet") == "other"
                and not attrs.get("diet_note")
            ):
                raise serializers.ValidationError(
                    {"diet_note": 'Při volbě „Jiné" prosím doplň poznámku.'}
                )
            return attrs

    return _Dynamic


class QuestionnaireAnswersSerializer(serializers.Serializer):
    """Backward-compat: legacy serializer used by some tests. Validates all
    fields as required. New code should call build_questionnaire_serializer().
    """

    tshirt_size = serializers.ChoiceField(choices=T_SHIRT_SIZES)
    diet = serializers.ChoiceField(choices=DIET_OPTIONS)
    diet_note = serializers.CharField(
        max_length=400, required=False, allow_blank=True
    )
    fitness_level = serializers.ChoiceField(choices=FITNESS_OPTIONS)
    fitness_note = serializers.CharField(
        max_length=500, required=False, allow_blank=True
    )
    health_notes = serializers.CharField(
        max_length=1000, required=False, allow_blank=True
    )
    emergency_contact_name = serializers.CharField(max_length=200)
    emergency_contact_phone = serializers.CharField(max_length=30)
    photo_consent = serializers.BooleanField()

    def validate(self, attrs):
        if attrs.get("diet") == "other" and not attrs.get("diet_note"):
            raise serializers.ValidationError(
                {"diet_note": 'Při volbě „Jiné" prosím doplň poznámku.'}
            )
        return attrs


class EventPublicSerializer(serializers.ModelSerializer):
    """Public-facing event payload for /api/events/{ws}/{slug}/."""

    cover_url = serializers.SerializerMethodField()
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    workspace_logo_url = serializers.SerializerMethodField()
    workspace_accent_color = serializers.CharField(
        source="workspace.accent_color", read_only=True
    )
    confirmed_count = serializers.IntegerField(
        source="confirmed_rsvp_count", read_only=True
    )
    is_open_for_rsvp = serializers.BooleanField(read_only=True)
    is_at_capacity = serializers.BooleanField(read_only=True)
    remaining_capacity = serializers.IntegerField(read_only=True)

    enabled_questionnaire_sections = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "slug",
            "title",
            "description",
            "cover_url",
            "starts_at",
            "ends_at",
            "tz",
            "location_text",
            "meeting_point_text",
            "location_url",
            "capacity",
            "waitlist_enabled",
            "visibility",
            "status",
            "requires_approval",
            "highlights",
            "included",
            "not_included",
            "additional_cost_note",
            "difficulty_level",
            "difficulty_note",
            "transport_info",
            "accommodation_info",
            "gear_info",
            "faq",
            "program",
            "price_text",
            "enabled_questionnaire_sections",
            "workspace_slug",
            "workspace_name",
            "workspace_logo_url",
            "workspace_accent_color",
            "confirmed_count",
            "is_open_for_rsvp",
            "is_at_capacity",
            "remaining_capacity",
            "cancellation_reason",
            "created_at",
        )
        read_only_fields = fields

    def get_cover_url(self, obj: Event) -> str | None:
        return obj.cover.url if obj.cover else None

    def get_workspace_logo_url(self, obj: Event) -> str | None:
        if obj.workspace.logo:
            return obj.workspace.logo.url
        return None

    def get_enabled_questionnaire_sections(self, obj: Event) -> list[str]:
        return obj.effective_questionnaire_sections


class EventSummarySerializer(serializers.ModelSerializer):
    """Compact event payload — for owner event lists and dashboard widgets."""

    cover_url = serializers.SerializerMethodField()
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    confirmed_count = serializers.IntegerField(
        source="confirmed_rsvp_count", read_only=True
    )
    waitlist_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = (
            "slug",
            "title",
            "starts_at",
            "ends_at",
            "tz",
            "location_text",
            "cover_url",
            "capacity",
            "status",
            "visibility",
            "workspace_slug",
            "confirmed_count",
            "waitlist_count",
        )
        read_only_fields = fields

    def get_cover_url(self, obj: Event) -> str | None:
        return obj.cover.url if obj.cover else None


class RSVPCreateSerializer(serializers.Serializer):
    """Anonymous or authenticated registration submission.

    Pass `event_sections=[...]` in context for dynamic field validation.
    Falls back to the legacy serializer if no sections supplied.
    """

    answers = serializers.DictField()
    account = serializers.DictField(
        child=serializers.CharField(allow_blank=True),
        required=False,
    )

    def validate_answers(self, value):
        enabled = (self.context or {}).get("event_sections")
        validator_cls = build_questionnaire_serializer(enabled or list(SECTION_FIELDS.keys()))
        inner = validator_cls(data=value)
        inner.is_valid(raise_exception=True)
        return inner.validated_data


class RSVPSerializer(serializers.ModelSerializer):
    """RSVP as seen by the Owner (with PII)."""

    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(
        source="user.get_full_name", read_only=True
    )
    user_phone = serializers.CharField(source="user.phone", read_only=True)

    class Meta:
        model = RSVP
        fields = (
            "id",
            "status",
            "user_email",
            "user_full_name",
            "user_phone",
            "questionnaire_answers",
            "waitlist_position",
            "attended",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class MyRSVPSerializer(serializers.ModelSerializer):
    """RSVP as seen by the participant themselves."""

    class Meta:
        model = RSVP
        fields = (
            "id",
            "status",
            "questionnaire_answers",
            "waitlist_position",
            "created_at",
        )
        read_only_fields = fields


class EventWriteSerializer(serializers.ModelSerializer):
    """Used for both create + update by workspace Owners."""

    class Meta:
        model = Event
        fields = (
            "slug",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "tz",
            "location_text",
            "meeting_point_text",
            "location_url",
            "capacity",
            "waitlist_enabled",
            "visibility",
            "status",
            "requires_approval",
            "highlights",
            "included",
            "not_included",
            "additional_cost_note",
            "difficulty_level",
            "difficulty_note",
            "transport_info",
            "accommodation_info",
            "gear_info",
            "faq",
            "program",
            "price_text",
            "enabled_questionnaire_sections",
            "cancellation_reason",
        )

    def validate_enabled_questionnaire_sections(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Musí být seznam.")
        valid_keys = set(SECTION_FIELDS.keys())
        bad = [v for v in value if v not in valid_keys]
        if bad:
            raise serializers.ValidationError(
                f"Neznámá sekce: {bad}. Povolené: {sorted(valid_keys)}."
            )
        return value

    def validate_difficulty_level(self, value):
        if value not in (0, 1, 2, 3, 4, 5):
            raise serializers.ValidationError(
                "Náročnost musí být v rozsahu 0-5 (0 = nezadáno)."
            )
        return value

    def validate_faq(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("FAQ musí být seznam.")
        for i, item in enumerate(value):
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    f"FAQ položka {i} musí být objekt."
                )
            if "question" not in item or "answer" not in item:
                raise serializers.ValidationError(
                    f"FAQ položka {i} musí mít pole 'question' a 'answer'."
                )
        return value

    def validate(self, attrs):
        starts = attrs.get("starts_at") or getattr(self.instance, "starts_at", None)
        ends = attrs.get("ends_at") or getattr(self.instance, "ends_at", None)
        if starts and ends and ends < starts:
            raise serializers.ValidationError(
                {"ends_at": "Konec nemůže být dřív než začátek."}
            )
        return attrs

    def validate_slug(self, value):
        from .models import validate_event_slug

        try:
            validate_event_slug(value)
        except Exception as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value
