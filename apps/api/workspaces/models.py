from django.conf import settings
from django.db import models
from django.utils import timezone

from .validators import validate_workspace_slug


class Workspace(models.Model):
    """A Creator's branded workspace. Tenant root (PRD §4.3)."""

    VISIBILITY_PUBLIC = "public"
    VISIBILITY_UNLISTED = "unlisted"
    VISIBILITY_PRIVATE = "private"
    VISIBILITY_CHOICES = [
        (VISIBILITY_PUBLIC, "Public — indexable, listed on the platform"),
        (VISIBILITY_UNLISTED, "Unlisted — accessible only with a direct link"),
        (VISIBILITY_PRIVATE, "Private — 404 to non-members"),
    ]

    slug = models.SlugField(
        unique=True,
        db_index=True,
        max_length=50,
        validators=[validate_workspace_slug],
        help_text="Lowercase, hyphenated. Used in URLs.",
    )
    name = models.CharField(max_length=100)
    bio = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    social_links = models.JSONField(default=dict, blank=True)
    accent_color = models.CharField(
        max_length=7, blank=True, help_text="Hex like #RRGGBB."
    )
    logo = models.ImageField(upload_to="workspaces/logos/", blank=True)
    cover = models.ImageField(upload_to="workspaces/covers/", blank=True)
    visibility = models.CharField(
        max_length=10, choices=VISIBILITY_CHOICES, default=VISIBILITY_PUBLIC
    )
    default_tz = models.CharField(
        max_length=50, default="UTC", help_text="IANA timezone, e.g. Europe/Prague."
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "workspaces_workspace"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def clean(self) -> None:
        super().clean()
        # Run validator on save too, not just at form level.
        validate_workspace_slug(self.slug)


class WorkspaceMember(models.Model):
    """User's role within a workspace (PRD §4.3, §4.8)."""

    ROLE_OWNER = "owner"
    ROLE_CHOICES = [
        (ROLE_OWNER, "Owner"),
    ]

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="members"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    role = models.CharField(
        max_length=20, choices=ROLE_CHOICES, default=ROLE_OWNER
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "workspaces_workspace_member"
        unique_together = [("workspace", "user")]
        ordering = ["workspace", "user_id"]

    def __str__(self) -> str:
        return f"{self.user} as {self.role} of {self.workspace}"
