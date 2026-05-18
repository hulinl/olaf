"""Community models (PRD §4.4).

A Community in V1 is a roster of members + a list of events shared into it.
Communities live under a Workspace (multi-tenant). Events are share-able
into one or more Communities via Event.communities m2m (PRD §4.5).

Wall feed (posts, comments, reactions) is V1.5 — not modeled here.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from workspaces.managers import TenantScopedModel
from workspaces.validators import SLUG_MAX_LENGTH, SLUG_RE


def validate_community_slug(value: str) -> None:
    if not value:
        raise ValidationError("Slug is required.")
    if len(value) > SLUG_MAX_LENGTH:
        raise ValidationError(
            f"Slug must be at most {SLUG_MAX_LENGTH} characters long."
        )
    if not SLUG_RE.match(value):
        raise ValidationError(
            "Slug must be lowercase ASCII letters and digits, "
            "with hyphens between words."
        )


class Community(TenantScopedModel):
    """One Community under a Workspace — a member roster + event list."""

    VISIBILITY_PRIVATE = "private"
    VISIBILITY_UNLISTED = "unlisted"
    VISIBILITY_PUBLIC = "public"
    VISIBILITY_CHOICES = [
        (VISIBILITY_PRIVATE, "Private — invite-only, hidden"),
        (VISIBILITY_UNLISTED, "Unlisted — link-only, hidden from lists"),
        (VISIBILITY_PUBLIC, "Public — visible, anyone can request to join"),
    ]

    MEMBERSHIP_APPROVAL = "approval"
    MEMBERSHIP_INVITE_ONLY = "invite_only"
    MEMBERSHIP_CHOICES = [
        (MEMBERSHIP_APPROVAL, "Approval-based — request → owner approves"),
        (MEMBERSHIP_INVITE_ONLY, "Invite-only — emailed token to join"),
    ]

    slug = models.SlugField(
        max_length=SLUG_MAX_LENGTH,
        validators=[validate_community_slug],
        help_text="Lowercase, hyphenated. Unique within the workspace.",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    cover = models.ImageField(upload_to="communities/covers/", blank=True)
    visibility = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default=VISIBILITY_PRIVATE,
    )
    membership_policy = models.CharField(
        max_length=20,
        choices=MEMBERSHIP_CHOICES,
        default=MEMBERSHIP_APPROVAL,
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communities_community"
        ordering = ["name"]
        unique_together = [("workspace", "slug")]
        indexes = [models.Index(fields=["workspace", "slug"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.workspace.slug}/{self.slug})"

    def clean(self) -> None:
        super().clean()
        validate_community_slug(self.slug)

    @property
    def member_count(self) -> int:
        return self.memberships.filter(status=CommunityMember.STATUS_MEMBER).count()


class CommunityMember(models.Model):
    """Membership relation between a User and a Community.

    Status is per-user (independent of workspace tenancy). Workspace owners
    can always view + manage their workspace's Community rosters.
    """

    STATUS_PENDING = "pending"
    STATUS_MEMBER = "member"
    STATUS_DECLINED = "declined"
    STATUS_REMOVED = "removed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending — awaiting approval"),
        (STATUS_MEMBER, "Member — accepted"),
        (STATUS_DECLINED, "Declined — user said no"),
        (STATUS_REMOVED, "Removed — owner removed them"),
    ]

    community = models.ForeignKey(
        Community, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_memberships",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    joined_at = models.DateTimeField(default=timezone.now)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "communities_communitymember"
        ordering = ["-joined_at"]
        unique_together = [("community", "user")]
        indexes = [
            models.Index(fields=["community", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} → {self.community} ({self.status})"
