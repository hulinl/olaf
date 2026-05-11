import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


def _generate_token() -> str:
    """256-bit URL-safe token, base64-encoded (~43 chars)."""
    return secrets.token_urlsafe(32)


class User(AbstractBaseUser, PermissionsMixin):
    """OLAF user. Email is the login identity (no username)."""

    FITNESS_BEGINNER = "beginner"
    FITNESS_INTERMEDIATE = "intermediate"
    FITNESS_ADVANCED = "advanced"
    FITNESS_LEVEL_CHOICES = [
        (FITNESS_BEGINNER, "Beginner"),
        (FITNESS_INTERMEDIATE, "Intermediate"),
        (FITNESS_ADVANCED, "Advanced"),
    ]

    # Identity
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    display_name = models.CharField(max_length=100, blank=True)

    # Contact
    phone = models.CharField(max_length=30, blank=True)
    dob = models.DateField(null=True, blank=True)
    avatar_blob_id = models.CharField(max_length=255, blank=True)
    address = models.CharField(max_length=500, blank=True)

    # Emergency contact
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)
    emergency_contact_relationship = models.CharField(max_length=100, blank=True)

    # Activity & experience
    fitness_level = models.CharField(max_length=20, choices=FITNESS_LEVEL_CHOICES, blank=True)
    sport_tags = models.JSONField(default=list, blank=True)
    bio = models.TextField(blank=True)

    # Auth + lifecycle
    email_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        db_table = "accounts_user"
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return self.email

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name


class EmailVerificationToken(models.Model):
    """24-hour token to verify a user's email address."""

    EXPIRY = timedelta(hours=24)

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="verification_tokens")
    token = models.CharField(max_length=64, unique=True, default=_generate_token, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "accounts_email_verification_token"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"email-verification for {self.user_id}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.created_at + self.EXPIRY

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and not self.is_expired

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])


class PasswordResetToken(models.Model):
    """1-hour token to reset a user's password."""

    EXPIRY = timedelta(hours=1)

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token = models.CharField(max_length=64, unique=True, default=_generate_token, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "accounts_password_reset_token"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"password-reset for {self.user_id}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.created_at + self.EXPIRY

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and not self.is_expired

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])
