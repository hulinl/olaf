"""DRF serializers for events + RSVPs."""
from __future__ import annotations

from rest_framework import serializers

from .models import RSVP, Event

# Hardcoded V1 questionnaire field set (per shipping path + camp reference).
# Frontend renders these as the registration form; backend validates the
# submitted payload has the expected shape.

T_SHIRT_SIZES = ("XS", "S", "M", "L", "XL", "XXL")
DIET_OPTIONS = ("omnivore", "vegetarian", "vegan", "other")
FITNESS_OPTIONS = ("beginner", "intermediate", "advanced")

REQUIRED_ANSWER_KEYS = {
    "tshirt_size",
    "diet",
    "fitness_level",
    "emergency_contact_name",
    "emergency_contact_phone",
    "photo_consent",
}


class QuestionnaireAnswersSerializer(serializers.Serializer):
    """Validates the JSONB payload stored on RSVP.questionnaire_answers."""

    tshirt_size = serializers.ChoiceField(choices=T_SHIRT_SIZES)
    diet = serializers.ChoiceField(choices=DIET_OPTIONS)
    diet_note = serializers.CharField(
        max_length=200, required=False, allow_blank=True
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
                {"diet_note": 'Please describe your diet when selecting "Other".'}
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
            "program",
            "price_text",
            "workspace_slug",
            "workspace_name",
            "workspace_logo_url",
            "workspace_accent_color",
            "confirmed_count",
            "is_open_for_rsvp",
            "is_at_capacity",
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

    If anonymous, the embedded `account` block is used to create a verified
    light-registration user before applying RSVP rules.
    """

    answers = QuestionnaireAnswersSerializer()
    # Anonymous flow — light registration.
    account = serializers.DictField(
        child=serializers.CharField(allow_blank=True),
        required=False,
    )


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
