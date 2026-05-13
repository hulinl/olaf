"""Event model — the unit of "something happening at a time and place" (PRD §4.5)."""
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from workspaces.managers import TenantScopedModel
from workspaces.validators import SLUG_MAX_LENGTH, SLUG_RE


def validate_event_slug(value: str) -> None:
    """Slug shape — same rules as workspace slugs minus the reserved-paths list
    (events live under /<workspace>/e/<event-slug> so they don't collide with
    platform routes).
    """
    if not value:
        raise ValidationError("Slug is required.")
    if len(value) > SLUG_MAX_LENGTH:
        raise ValidationError(
            f"Slug must be at most {SLUG_MAX_LENGTH} characters long."
        )
    if not SLUG_RE.match(value):
        raise ValidationError(
            "Slug must be lowercase ASCII letters and digits, "
            "with hyphens between words (e.g. 'letni-kemp-2026')."
        )


class Event(TenantScopedModel):
    """A workspace's event — a single-day group run through a 4-day camp."""

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_CLOSED = "closed"
    STATUS_CANCELLED = "cancelled"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft — visible only to the creator"),
        (STATUS_PUBLISHED, "Published — RSVPs open"),
        (STATUS_CLOSED, "Closed — RSVPs no longer accepted"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_COMPLETED, "Completed (auto-transition after end)"),
    ]

    VISIBILITY_PUBLIC = "public"
    VISIBILITY_INVITE_ONLY = "invite_only"
    # PRD §4.5 also lists 'community', but Communities are deferred per the
    # shipping path; revisit when Slice 3 (Communities) lands properly.
    VISIBILITY_CHOICES = [
        (VISIBILITY_PUBLIC, "Public — anyone with the link can RSVP"),
        (VISIBILITY_INVITE_ONLY, "Invite-only — emailed tokens only"),
    ]

    # Workspace FK + objects = TenantManager come from TenantScopedModel.

    slug = models.SlugField(
        max_length=SLUG_MAX_LENGTH,
        validators=[validate_event_slug],
        help_text="Lowercase, hyphenated. Unique within the workspace.",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(
        blank=True,
        help_text="Plain text for now; rich-text/markdown editor lands later.",
    )
    cover = models.ImageField(upload_to="events/covers/", blank=True)

    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    tz = models.CharField(
        max_length=50,
        default="UTC",
        help_text="IANA timezone, e.g. Europe/Prague. Defaults to workspace tz.",
    )

    location_text = models.CharField(max_length=300, blank=True)
    meeting_point_text = models.CharField(max_length=300, blank=True)
    location_url = models.URLField(
        max_length=500,
        blank=True,
        help_text="Optional map link (Google Maps, Mapy.cz, etc.).",
    )

    capacity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum confirmed RSVPs. Empty = unlimited.",
    )
    waitlist_enabled = models.BooleanField(
        default=True,
        help_text="When capacity is reached, additional RSVPs join a waitlist.",
    )

    visibility = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default=VISIBILITY_PUBLIC,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
    )
    requires_approval = models.BooleanField(
        default=False,
        help_text="If true, RSVPs land in pending_approval until the Creator confirms.",
    )
    cancellation_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "events_event"
        ordering = ["-starts_at"]
        unique_together = [("workspace", "slug")]
        indexes = [
            models.Index(fields=["workspace", "status", "starts_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.workspace.slug}/{self.slug})"

    def clean(self) -> None:
        super().clean()
        validate_event_slug(self.slug)
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValidationError(
                {"ends_at": "End date/time cannot be earlier than start."}
            )

    @property
    def is_open_for_rsvp(self) -> bool:
        return self.status == self.STATUS_PUBLISHED
