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
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
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
            "dob",
            "avatar_blob_id",
            "address",
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
            # System
            "email_verified",
            "date_joined",
        )
        read_only_fields = ("id", "email", "email_verified", "date_joined")
