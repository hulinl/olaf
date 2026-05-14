"""Event + RSVP models (PRD §4.5, §4.6, §8)."""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
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

    # V1 simplification (per shipping path): camp-specific structured copy
    # the public landing page renders without a rich-text editor or a per-event
    # questionnaire builder. Free-form lists; the frontend renders bullets.
    highlights = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            'Bullet list of "what we\'ll focus on" (e.g. ["technika běhu", '
            '"regenerace", "výživa", "výbava"]).'
        ),
    )
    included = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Bullet list of what's included in the price "
            '(["3 noci ubytování", "tréninky", "fotky", "snídaně + večeře"]).'
        ),
    )
    program = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Day-by-day program for the public landing page. Each entry is "
            '{"day": "Čtvrtek", "title": "Příjezd", "body": "Přijeď..."}.'
        ),
    )
    price_text = models.CharField(
        max_length=50,
        blank=True,
        help_text='Free-form price string for the landing page, e.g. "2 450 Kč".',
    )

    # Configurable RSVP questionnaire — which max-set sections appear on the
    # RSVP form. Owner picks per-event. Empty default = all enabled for
    # backwards compat with existing events.
    QUESTIONNAIRE_SECTION_TSHIRT = "tshirt_size"
    QUESTIONNAIRE_SECTION_DIET = "diet"
    QUESTIONNAIRE_SECTION_FITNESS = "fitness"
    QUESTIONNAIRE_SECTION_HEALTH = "health_notes"
    QUESTIONNAIRE_SECTION_EMERGENCY = "emergency_contact"
    QUESTIONNAIRE_SECTION_PHOTO = "photo_consent"
    QUESTIONNAIRE_SECTIONS_ALL = [
        QUESTIONNAIRE_SECTION_TSHIRT,
        QUESTIONNAIRE_SECTION_DIET,
        QUESTIONNAIRE_SECTION_FITNESS,
        QUESTIONNAIRE_SECTION_HEALTH,
        QUESTIONNAIRE_SECTION_EMERGENCY,
        QUESTIONNAIRE_SECTION_PHOTO,
    ]
    enabled_questionnaire_sections = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Which questionnaire sections appear on this event's RSVP form. "
            "Empty list = all sections enabled (backwards compat)."
        ),
    )

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

    @property
    def effective_questionnaire_sections(self) -> list[str]:
        """Empty list defaults to all sections enabled."""
        if not self.enabled_questionnaire_sections:
            return list(self.QUESTIONNAIRE_SECTIONS_ALL)
        return list(self.enabled_questionnaire_sections)

    @property
    def confirmed_rsvp_count(self) -> int:
        return self.rsvps.filter(status=RSVP.STATUS_YES).count()

    @property
    def waitlist_count(self) -> int:
        return self.rsvps.filter(status=RSVP.STATUS_WAITLIST).count()

    @property
    def is_at_capacity(self) -> bool:
        if self.capacity is None:
            return False
        return self.confirmed_rsvp_count >= self.capacity


class RSVP(models.Model):
    """A participant's registration for an event (PRD §4.6)."""

    STATUS_YES = "yes"
    STATUS_MAYBE = "maybe"
    STATUS_NO = "no"
    STATUS_WAITLIST = "waitlist"
    STATUS_PENDING_APPROVAL = "pending_approval"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_YES, "Confirmed"),
        (STATUS_MAYBE, "Maybe"),
        (STATUS_NO, "Declined"),
        (STATUS_WAITLIST, "On waitlist"),
        (STATUS_PENDING_APPROVAL, "Pending creator approval"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="rsvps"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rsvps",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_YES
    )
    questionnaire_answers = models.JSONField(default=dict, blank=True)
    waitlist_position = models.PositiveIntegerField(null=True, blank=True)
    attended = models.BooleanField(
        null=True,
        blank=True,
        help_text="Set by the Creator after the event.",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "events_rsvp"
        ordering = ["created_at"]
        unique_together = [("event", "user")]
        indexes = [
            models.Index(fields=["event", "status"]),
            models.Index(fields=["event", "status", "waitlist_position"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} → {self.event.slug} ({self.status})"

    # ---- waitlist mechanics -------------------------------------------------

    @classmethod
    @transaction.atomic
    def create_for_event(
        cls,
        *,
        event: Event,
        user,
        questionnaire_answers: dict,
    ) -> "RSVP":
        """Create or update an RSVP applying capacity + waitlist rules.

        Returns the (created or updated) RSVP. Callers can check `rsvp.status`
        to decide whether the participant is confirmed, waitlisted, or pending.
        """
        # Lock the event row to serialise capacity decisions across concurrent
        # registrations.
        locked_event = Event.objects.select_for_update().get(pk=event.pk)

        # A brand-new RSVP starts in a placeholder state so that is_at_capacity
        # doesn't accidentally count *this* RSVP as confirmed.
        rsvp, created = cls.objects.select_for_update().get_or_create(
            event=locked_event,
            user=user,
            defaults={
                "questionnaire_answers": questionnaire_answers,
                "status": cls.STATUS_NO,
            },
        )
        rsvp.questionnaire_answers = questionnaire_answers
        previous_status = rsvp.status if not created else None

        if locked_event.requires_approval:
            rsvp.status = cls.STATUS_PENDING_APPROVAL
            rsvp.waitlist_position = None
        elif previous_status == cls.STATUS_YES:
            # Already confirmed; idempotent re-submit just refreshes answers.
            rsvp.waitlist_position = None
        elif previous_status == cls.STATUS_WAITLIST:
            # Keep them on the waitlist at their current position.
            pass
        elif locked_event.is_at_capacity and locked_event.waitlist_enabled:
            rsvp.status = cls.STATUS_WAITLIST
            rsvp.waitlist_position = cls._next_waitlist_position(locked_event)
        elif locked_event.is_at_capacity and not locked_event.waitlist_enabled:
            raise ValidationError(
                "Event is at capacity and waitlist is disabled."
            )
        else:
            rsvp.status = cls.STATUS_YES
            rsvp.waitlist_position = None

        rsvp.save()
        return rsvp

    @staticmethod
    def _next_waitlist_position(event: Event) -> int:
        last = (
            RSVP.objects.filter(event=event, status=RSVP.STATUS_WAITLIST)
            .order_by("-waitlist_position")
            .values_list("waitlist_position", flat=True)
            .first()
        )
        return (last or 0) + 1

    @transaction.atomic
    def cancel(self) -> None:
        """Cancel this RSVP and FIFO-promote the head of the waitlist."""
        if self.status == self.STATUS_CANCELLED:
            return

        was_confirmed = self.status == self.STATUS_YES
        self.status = self.STATUS_CANCELLED
        self.waitlist_position = None
        self.save(update_fields=["status", "waitlist_position", "updated_at"])

        if was_confirmed and self.event.waitlist_enabled:
            head = (
                RSVP.objects.select_for_update()
                .filter(event=self.event, status=self.STATUS_WAITLIST)
                .order_by("waitlist_position")
                .first()
            )
            if head is not None:
                head.status = self.STATUS_YES
                head.waitlist_position = None
                head.save(update_fields=["status", "waitlist_position", "updated_at"])
                # Email fan-out lives in the view layer; we return None here.
