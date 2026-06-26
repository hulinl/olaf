"""Event + RSVP models (PRD §4.5, §4.6, §8)."""
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from workspaces.managers import TenantQuerySet, TenantScopedModel
from workspaces.validators import SLUG_MAX_LENGTH, SLUG_RE


class EventQuerySet(TenantQuerySet):
    """Event queryset with explicit alive/deleted filters. Used by
    both the default `objects` manager (alive-only) and the escape-
    hatch `all_objects` manager (full set)."""

    def alive(self) -> "EventQuerySet":
        return self.filter(deleted_at__isnull=True)

    def deleted(self) -> "EventQuerySet":
        return self.filter(deleted_at__isnull=False)


class AliveEventManager(models.Manager.from_queryset(EventQuerySet)):
    """Default manager — hides soft-deleted rows. Existing list /
    detail queries (`Event.objects.filter(...)`, `Event.objects.get(
    slug=...)`) automatically exclude trashed events."""

    def get_queryset(self) -> EventQuerySet:
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllEventsManager(models.Manager.from_queryset(EventQuerySet)):
    """Escape-hatch — used by the restore endpoint, the purge endpoint,
    and the 30-day retention Celery task. NEVER use this from the
    public event-list/detail views."""

    pass


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
    require_phone_on_rsvp = models.BooleanField(
        default=True,
        help_text=(
            "Vyžadovat telefon při registraci. Default True kvůli "
            "emergencies (pořadatel potřebuje sehnat účastníka v terénu). "
            "U casual akcí (opékání špekáčků, komunita) si owner odznačí."
        ),
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

    # Block-based landing — ordered list of content blocks rendered by the
    # public landing page (see events/blocks.py for schema). Every visible
    # content surface is a block; the form on /edit only handles event
    # mechanics (time, capacity, RSVP, sharing).
    blocks = models.JSONField(
        default=list,
        blank=True,
        help_text="List of {id, type, payload} content blocks. See events/blocks.py.",
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
            "Empty list = no questionnaire (form collects only user profile)."
        ),
    )

    # Communities the event has been shared into (PRD §4.5 line 179).
    # Multi-community sharing landed with Slice 3.
    communities = models.ManyToManyField(
        "communities.Community",
        blank=True,
        related_name="events",
        help_text="Communities under the workspace where this event is listed.",
    )

    # Cross-workspace sharing (Slice 3 of V1 plan). An event is owned by
    # ONE workspace (the `workspace` FK above) but the creator can also
    # publish it into other workspaces they own. Visitors of those
    # workspaces see the event in the same lists as the owner's.
    shared_workspaces = models.ManyToManyField(
        "workspaces.Workspace",
        blank=True,
        related_name="shared_events",
        help_text=(
            "Additional workspaces (komunity) where this event appears. "
            "Only workspaces the creator also owns may be added."
        ),
    )

    # Price (optional — events default to free; owner sets a price per event).
    # No payment processing here; this just propagates to the landing page +
    # later wires into RSVP.payment_due_amount (Slice 5).
    price_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Set price → event is paid. Null → event is free.",
    )
    price_currency = models.CharField(max_length=3, default="CZK")
    price_note = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text='Short qualifier shown next to the price (e.g. "vč. DPH", "záloha 1 000 Kč").',
    )

    # Billing identity used on invoices for this event. Falls back to
    # the creator's default BillingProfile when null.
    billing_profile = models.ForeignKey(
        "accounts.BillingProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
        help_text="Owner picks which of their billing profiles to invoice from.",
    )
    # When True the event is still paid (price_amount set), but the
    # money changes hands on site — no QR, no invoice, no RSVP.payment
    # workflow. Owner just notes who paid in the roster.
    payment_in_cash = models.BooleanField(
        default=False,
        help_text=(
            "Owner takes payment in cash on the day. Skips QR + invoice "
            "generation; payment status stays informational."
        ),
    )

    # Risk-checklist for the event (V2 feature). Owner ticks through
    # weather / route / equipment / medical / etc. items before the
    # event runs. JSONField mirrors required_documents — list of
    # {key, label, category, status, notes}. Empty list = owner hasn't
    # set anything up yet; FE offers a "Načíst šablonu" button that
    # pre-populates a sensible default they can then trim.
    risk_checklist = models.JSONField(default=list, blank=True)

    # Recommended gear — owner attaches one of their GearLists. The
    # public landing renders a bare "Doporučené vybavení" section
    # (just item names + category, no URLs/prices); a registered
    # participant gets the same items as a checklist they tick off
    # while packing. SET_NULL on list delete keeps the event intact.
    recommended_gear_list = models.ForeignKey(
        "gear.GearList",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recommended_for_events",
        help_text="Optional GearList shown to participants as a packing checklist.",
    )

    # Required documents (Slice 7). Owner declares a list of documents
    # the participant must upload (waiver, insurance card, parental
    # consent, ...). Each item is {key, label, required}. Files land in
    # RSVPDocument rows tied to the RSVP.
    required_documents = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            'Documents required from participants: '
            '[{"key": "waiver", "label": "Souhlas s riziky", "required": true}, ...].'
        ),
    )

    # External identifier for idempotent imports (e.g. Claude Code skill in
    # a separate planning project re-runs the same publish). Owner picks
    # a stable string per event source — when an import POST carries the
    # same external_ref under the same workspace, we update in place
    # instead of creating a duplicate. Blank = legacy / hand-created
    # event, never collapsed by the importer.
    external_ref = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text=(
            "Stable identifier from the external system that produced this "
            "event (e.g. 'beskydy-spring-camp-2026'). Used by the import "
            "endpoint to upsert instead of duplicate."
        ),
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    # Soft-delete columns. The default `objects` manager hides rows
    # with deleted_at set; the parallel `all_objects` manager surfaces
    # them for restore/purge flows + retention task.
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Set when the owner soft-deletes the event. NULL = alive. "
            "Rows with deleted_at older than 30 days are hard-purged by "
            "the `events.purge_old_soft_deletes` Celery task."
        ),
    )
    deleted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Audit pointer — who soft-deleted this event.",
    )

    objects = AliveEventManager()
    all_objects = AllEventsManager()

    class Meta:
        db_table = "events_event"
        ordering = ["-starts_at"]
        unique_together = [("workspace", "slug")]
        indexes = [
            models.Index(fields=["workspace", "status", "starts_at"]),
        ]
        constraints = [
            # Idempotency for the import endpoint — one external_ref per
            # workspace. Blank refs are excluded so hand-created events
            # don't collide.
            models.UniqueConstraint(
                fields=["workspace", "external_ref"],
                condition=models.Q(external_ref__gt=""),
                name="unique_workspace_external_ref",
            ),
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
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self, user=None) -> None:
        """Mark the event as deleted but keep the row. Restorable for
        the retention window (30 days) before the Celery task hard-
        purges it. Public + owner-facing queries hide deleted_at != null
        events automatically via the default manager."""
        if self.deleted_at is not None:
            return
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=["deleted_at", "deleted_by", "updated_at"])

    def restore(self) -> None:
        """Undo a soft-delete. No-op when the event isn't deleted."""
        if self.deleted_at is None:
            return
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=["deleted_at", "deleted_by", "updated_at"])

    @property
    def effective_questionnaire_sections(self) -> list[str]:
        """Whatever the owner has explicitly enabled — empty list is
        a valid state meaning "no extra questionnaire, just the
        profile fields." Legacy events created before the toggle
        existed are migrated to the full set in
        events.0019_seed_questionnaire_sections."""
        return list(self.enabled_questionnaire_sections or [])

    @property
    def confirmed_rsvp_count(self) -> int:
        """Confirmed *participants* (excludes organizers). The capacity
        + waitlist logic should both run off this number."""
        return self.rsvps.filter(
            status=RSVP.STATUS_YES, is_organizer=False
        ).count()

    @property
    def organizer_count(self) -> int:
        return self.rsvps.filter(is_organizer=True).count()

    @property
    def waitlist_count(self) -> int:
        return self.rsvps.filter(status=RSVP.STATUS_WAITLIST).count()

    @property
    def pending_approval_count(self) -> int:
        return self.rsvps.filter(status=RSVP.STATUS_PENDING_APPROVAL).count()

    @property
    def is_at_capacity(self) -> bool:
        if self.capacity is None:
            return False
        return self.confirmed_rsvp_count >= self.capacity

    @property
    def remaining_capacity(self) -> int | None:
        """How many confirmed slots are still open. None if unlimited."""
        if self.capacity is None:
            return None
        return max(0, self.capacity - self.confirmed_rsvp_count)


class EventImage(models.Model):
    """One image in an event's gallery. Separate from Event.cover (single hero
    image) — these are the "vibes" gallery rendered as a grid on the landing.
    """

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to="events/gallery/")
    alt_text = models.CharField(max_length=200, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "events_eventimage"
        ordering = ["sort_order", "id"]
        indexes = [models.Index(fields=["event", "sort_order"])]

    def __str__(self) -> str:
        return f"Image #{self.pk} for {self.event.slug}"


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
    # Magic-link token pro guest-side cancel. Anon RSVP nemá session,
    # takže registrant nemůže přijít přes klasický auth-required
    # `/rsvp/cancel/` endpoint. V confirmation mailu posíláme odkaz
    # `/{ws}/e/{slug}/rsvp/cancel?token=<this>` který zvládne cancel
    # bez přihlášení. UUID v4 stačí — bruteforce neuhodí (122 bits
    # entropy + per-RSVP unique).
    cancel_token = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        db_index=True,
    )
    # Kdo zrušil registraci — owner v rosteru vidí "Sám zrušil" vs
    # "Zrušil pořadatel" badge, aby měl kontext na cancelled řádkách.
    # Prázdný string = aktivní RSVP nebo legacy bez záznamu.
    CANCELLATION_SELF = "self"
    CANCELLATION_BY_TOKEN = "by_token"  # magic-link z e-mailu
    CANCELLATION_OWNER = "owner"
    CANCELLATION_CHOICES = [
        (CANCELLATION_SELF, "Self"),
        (CANCELLATION_BY_TOKEN, "Via magic-link"),
        (CANCELLATION_OWNER, "Owner"),
    ]
    cancellation_reason = models.CharField(
        max_length=20,
        choices=CANCELLATION_CHOICES,
        blank=True,
        default="",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    # Soft-dismiss "Možný duplikát" badge — owner explicitně řekl "ne,
    # není to duplikát" (typický případ: otec a syn se stejným jménem).
    # `True` = detekce ho v tomhle eventu už ignoruje. Per-event, per-
    # RSVP. Nepřenáší se do dalších eventů — duplicates se počítají
    # vždy fresh z aktuálního eventu.
    duplicate_dismissed = models.BooleanField(default=False)
    questionnaire_answers = models.JSONField(default=dict, blank=True)
    waitlist_position = models.PositiveIntegerField(null=True, blank=True)
    attended = models.BooleanField(
        null=True,
        blank=True,
        help_text="Set by the Creator after the event.",
    )

    # Packing-checklist state for Event.recommended_gear_list. Keys are
    # stringified GearListItem ids (the through-table entry), values
    # are ISO-8601 timestamps for when the participant ticked the box.
    # Unchecked items are simply absent from the dict.
    gear_checklist = models.JSONField(default=dict, blank=True)

    # Organizer flag — a person who's on the event in a help-the-event-
    # happen capacity, not as a paying attendee. Organizers:
    #   * appear in the roster with an Organizátor badge
    #   * are excluded from confirmed_rsvp_count / capacity / waitlist
    #   * have payment_status forced to "waived" (no QR, no invoice)
    #   * are skipped by required_documents checks at the roster level
    # Independent of EventCollaborator (edit rights) — a person can be
    # an organizer without being a co-creator, or both.
    is_organizer = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Doesn't count toward capacity, exempt from payment + docs.",
    )

    # Payment (Slice 5). Wired only when event.price_amount is set;
    # free events keep payment_status="waived" and the rest stays null.
    PAYMENT_PENDING = "pending"
    PAYMENT_PAID = "paid"
    PAYMENT_REFUNDED = "refunded"
    PAYMENT_WAIVED = "waived"  # event is free or owner comp'd this RSVP
    PAYMENT_CHOICES = [
        (PAYMENT_PENDING, "Pending"),
        (PAYMENT_PAID, "Paid"),
        (PAYMENT_REFUNDED, "Refunded"),
        (PAYMENT_WAIVED, "Waived"),
    ]
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_CHOICES,
        default=PAYMENT_WAIVED,
    )
    payment_due_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    payment_currency = models.CharField(max_length=3, blank=True, default="")
    variable_symbol = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="Czech 'variabilní symbol' (max 10 digits) for QR Platba.",
    )
    paid_at = models.DateTimeField(null=True, blank=True)

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

        # Owner/admin workspace-u nemusí čekat na schválení vlastní akce —
        # akce vyžadující approval je gate pro veřejnost, ne pro toho,
        # kdo akci pořádá. User report 2026-06-26: „mám sám sebe v
        # přihlášce jako čeká na schválení".
        from workspaces.models import WorkspaceMember

        is_workspace_admin = (
            user is not None
            and user.is_authenticated
            and WorkspaceMember.objects.filter(
                workspace=locked_event.workspace,
                user=user,
                role__in=[
                    WorkspaceMember.ROLE_OWNER,
                    WorkspaceMember.ROLE_ADMIN,
                ],
            ).exists()
        )

        # Tvůrce / admin akce je automaticky organizátor (= nezapočítává
        # se do kapacity, neplatí, badge „Organizátor" v rosteru). User
        # report 2026-06-26: „když jsem tvůrce, měl bych tam být
        # automaticky jako organizátor". Nastavujeme jen jednou — pokud
        # owner ručně toggle-em vypnul organizer flag (=teď chce být
        # počítán v kapacitě), nepřepisujeme zpátky.
        if is_workspace_admin and created:
            rsvp.is_organizer = True
            rsvp.payment_status = cls.PAYMENT_WAIVED

        if locked_event.requires_approval and not is_workspace_admin:
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

        # Wire payment fields once, when the RSVP is first created against
        # a paid event. Subsequent edits don't bump amount/VS — that keeps
        # the variable_symbol stable across answer updates so the QR the
        # user already has stays valid.
        if (
            created
            and locked_event.price_amount
            and not locked_event.payment_in_cash
        ):
            rsvp.payment_status = cls.PAYMENT_PENDING
            rsvp.payment_due_amount = locked_event.price_amount
            rsvp.payment_currency = locked_event.price_currency or "CZK"
            # Save once first so we have rsvp.id for the VS, then re-save
            # with the VS populated. Two writes is fine — happens once per
            # RSVP lifetime.
            rsvp.save()
            from .payments import next_variable_symbol

            rsvp.variable_symbol = next_variable_symbol(rsvp.id, locked_event.id)
            rsvp.save(update_fields=["variable_symbol", "updated_at"])
            _maybe_schedule_auto_contract(rsvp)
            return rsvp

        rsvp.save()
        _maybe_schedule_auto_contract(rsvp)
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
    def cancel(self, *, reason: str = "") -> None:
        """Cancel this RSVP and FIFO-promote the head of the waitlist.

        `reason` ukládá kontext, kdo nebo jak cancel proběhl, ať to v
        rosteru u zrušených registrací owner viděl ("Sám zrušil" /
        "Zrušil pořadatel" / "Magic-link z mailu"). Prázdný string =
        legacy bez záznamu. Hodnoty z `RSVP.CANCELLATION_CHOICES`.
        """
        if self.status == self.STATUS_CANCELLED:
            return

        was_confirmed = self.status == self.STATUS_YES
        self.status = self.STATUS_CANCELLED
        self.waitlist_position = None
        if reason:
            self.cancellation_reason = reason
        self.cancelled_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "waitlist_position",
                "cancellation_reason",
                "cancelled_at",
                "updated_at",
            ]
        )

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

    @transaction.atomic
    def delete_by_owner(self) -> None:
        """Hard-remove RSVP from event (owner action).

        Soft-cancel (`cancel()`) leaves the row plus EventCollaborator
        link in place, which caused a real bug: owner removed an
        organizer, the user re-registered, and `get_or_create` in
        `create_for_event` revived the old row with `is_organizer=True`
        and the EventCollaborator row still active — so they sat in
        pending_approval *and* had edit rights, without showing up as
        approvable in the roster.

        Owner-remove is destructive on purpose: the participant should
        re-apply from scratch (questionnaire, approval, payment). Self-
        cancel keeps the soft path so a user can re-join easily.

        Order matters: promote waitlist BEFORE delete to avoid the row
        being counted as confirmed during capacity recompute. Audit and
        email are caller responsibility (they have the actor + want
        snapshots before mutation).
        """
        was_confirmed = self.status == self.STATUS_YES

        if was_confirmed and self.event.waitlist_enabled:
            head = (
                RSVP.objects.select_for_update()
                .filter(event=self.event, status=self.STATUS_WAITLIST)
                .exclude(pk=self.pk)
                .order_by("waitlist_position")
                .first()
            )
            if head is not None:
                head.status = self.STATUS_YES
                head.waitlist_position = None
                head.save(update_fields=["status", "waitlist_position", "updated_at"])

        if self.user_id is not None:
            EventCollaborator.objects.filter(
                event=self.event, user_id=self.user_id
            ).delete()

        self.delete()


class RSVPDocument(models.Model):
    """One uploaded file matching one entry in event.required_documents.

    Owner defines required documents on the Event; participants upload
    files keyed by the document's `key`. We allow multiple uploads per
    (rsvp, key) and use the most recent as canonical (so users can fix
    a mistake). Owner reviews/approves via `verified_at` or rejects via
    `rejected_at` + free-text `reject_reason` (mail to user).
    """

    rsvp = models.ForeignKey(
        RSVP, on_delete=models.CASCADE, related_name="documents"
    )
    key = models.CharField(
        max_length=60,
        help_text="Matches a key inside event.required_documents.",
    )
    file = models.FileField(upload_to="events/rsvp-docs/")
    original_name = models.CharField(max_length=255, blank=True, default="")
    uploaded_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_rsvp_documents",
    )
    # Reject flow (V1 — odděleno od `verified`). Owner může dokument
    # zamítnout s textovým důvodem — backend pošle účastníkovi e-mail,
    # ten ví, co je špatně, a může nahrát znovu. Nový upload pod stejný
    # klíč implicitně překryje rejected záznam (latest = canonical).
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rejected_rsvp_documents",
    )
    reject_reason = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "events_rsvpdocument"
        ordering = ["-uploaded_at"]
        indexes = [models.Index(fields=["rsvp", "key"])]

    def __str__(self) -> str:
        return f"{self.rsvp_id}/{self.key} (#{self.pk})"

    @property
    def status(self) -> str:
        if self.rejected_at:
            return "rejected"
        if self.verified_at:
            return "verified"
        return "pending"


class Invoice(models.Model):
    """Invoice generated when an RSVP for a paid event is marked paid.

    V1 keeps numbering simple (auto-incrementing per workspace via the
    db sequence underneath) and stores rendered fields denormalized so
    the invoice stays correct even if the user later edits their address.
    PDF rendering is V1.5 (WeasyPrint).
    """

    STATUS_DRAFT = "draft"
    STATUS_ISSUED = "issued"
    STATUS_PAID = "paid"
    STATUS_VOID = "void"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_ISSUED, "Issued"),
        (STATUS_PAID, "Paid"),
        (STATUS_VOID, "Void"),
    ]

    rsvp = models.OneToOneField(
        RSVP, on_delete=models.PROTECT, related_name="invoice"
    )
    number = models.CharField(
        max_length=40,
        unique=True,
        help_text="Public invoice number (e.g. 'OLAF-2026-0001').",
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_ISSUED
    )

    # Snapshot of supplier (workspace owner) at issue time.
    supplier_name = models.CharField(max_length=200)
    supplier_address = models.TextField(blank=True, default="")
    supplier_ico = models.CharField(max_length=20, blank=True, default="")
    supplier_dic = models.CharField(max_length=20, blank=True, default="")
    supplier_iban = models.CharField(max_length=34, blank=True, default="")

    # Snapshot of customer (user) at issue time.
    customer_name = models.CharField(max_length=200)
    customer_address = models.TextField(blank=True, default="")
    customer_ico = models.CharField(max_length=20, blank=True, default="")
    customer_dic = models.CharField(max_length=20, blank=True, default="")
    customer_email = models.EmailField(blank=True, default="")

    # Items rendered as a list of {label, qty, unit_price, subtotal}.
    items = models.JSONField(default=list, blank=True)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="CZK")
    variable_symbol = models.CharField(max_length=10, blank=True, default="")

    issued_at = models.DateTimeField(default=timezone.now)
    due_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "events_invoice"
        ordering = ["-issued_at"]
        indexes = [models.Index(fields=["rsvp"])]

    def __str__(self) -> str:
        return self.number


def _resolve_supplier_for_event(event: "Event") -> dict:
    """Compute supplier_* fields from event.billing_profile, falling back
    to the workspace owner's default profile, then to the bare Workspace.

    Returned dict has the exact keys Invoice expects (supplier_name,
    supplier_address, supplier_ico, supplier_dic, supplier_iban) so the
    caller can hand it to Invoice() or .update() without reshape.
    """
    workspace = event.workspace
    profile = event.billing_profile
    if profile is None:
        from accounts.models import BillingProfile

        owner_id = (
            workspace.members.filter(role="owner")
            .values_list("user_id", flat=True)
            .first()
        )
        if owner_id:
            profile = (
                BillingProfile.objects.filter(user_id=owner_id, is_default=True)
                .first()
            )
            if profile is None:
                profile = BillingProfile.objects.filter(user_id=owner_id).first()

    if profile:
        return {
            "supplier_name": profile.legal_name,
            "supplier_address": "\n".join(
                filter(
                    None,
                    [
                        profile.address_street.strip() if profile.address_street else "",
                        f"{profile.address_zip} {profile.address_city}".strip(),
                        profile.address_country,
                    ],
                )
            ),
            "supplier_ico": profile.ico,
            "supplier_dic": profile.dic,
            "supplier_iban": profile.iban or workspace.payment_iban,
        }
    return {
        "supplier_name": workspace.name,
        "supplier_address": workspace.location or "",
        "supplier_ico": "",
        "supplier_dic": "",
        "supplier_iban": workspace.payment_iban,
    }


def refresh_invoice_supplier(invoice: "Invoice") -> "Invoice":
    """Re-snapshot the invoice's supplier_* fields from the event's
    current BillingProfile (or fallback chain). User explicitly asked for
    live sync on view/download (issued 2026-05-19), so we treat the
    invoice supplier as a derived view of the profile instead of a
    frozen snapshot. Customer fields stay snapshotted — those are
    accounting-sensitive and can be edited per-invoice if needed.

    Returns the invoice (saved if anything changed).
    """
    fields = _resolve_supplier_for_event(invoice.rsvp.event)
    dirty = []
    for key, value in fields.items():
        if getattr(invoice, key) != value:
            setattr(invoice, key, value)
            dirty.append(key)
    if dirty:
        dirty.append("updated_at")
        invoice.save(update_fields=dirty)
    return invoice


def generate_invoice_for_rsvp(rsvp: RSVP) -> Invoice:
    """Build (or refresh-snapshot) the Invoice tied to an RSVP.

    Idempotent: if an invoice already exists, returns it unchanged. The
    caller (mark_rsvp_paid) catches the "already exists" case.

    Skips invoice generation only for free events. Cash-on-site events
    DO generate an invoice — the owner marks the RSVP paid manually
    after collecting the money, which fires this generator the same way
    as bank-transfer events do. Standardizes the participant's
    "Stáhnout fakturu" experience regardless of payment method.
    """
    try:
        return rsvp.invoice
    except Invoice.DoesNotExist:
        pass

    event = rsvp.event
    workspace = event.workspace
    user = rsvp.user

    if rsvp.is_organizer:
        raise ValueError("Organizer RSVP — no invoice to issue.")

    if not event.price_amount:
        raise ValueError("Event has no price — no invoice to issue.")

    supplier = _resolve_supplier_for_event(event)

    # Customer snapshot — prefer billing_* when the user has flipped the
    # gate, otherwise fall back to plain address_*.
    use_billing = getattr(user, "has_billing_address", False) and (
        user.billing_street or user.billing_city or user.billing_name
    )
    if use_billing:
        customer_name = user.billing_name or user.get_full_name()
        customer_lines = [
            user.billing_street,
            f"{user.billing_zip} {user.billing_city}".strip(),
            user.billing_country,
        ]
        customer_ico = user.billing_ico
        customer_dic = user.billing_dic
    else:
        customer_name = user.get_full_name() or user.email
        customer_lines = [
            user.address_street,
            f"{user.address_zip} {user.address_city}".strip(),
            user.address_country,
        ]
        customer_ico = ""
        customer_dic = ""
    customer_address = "\n".join(
        filter(None, [line.strip() for line in customer_lines])
    )

    amount = rsvp.payment_due_amount or event.price_amount or 0
    currency = rsvp.payment_currency or event.price_currency or "CZK"

    # V1 number: workspace slug + YYYY + 4-digit seq (per workspace).
    year = timezone.now().year
    seq_count = (
        Invoice.objects.filter(
            number__startswith=f"{workspace.slug.upper()}-{year}-"
        ).count()
        + 1
    )
    number = f"{workspace.slug.upper()}-{year}-{seq_count:04d}"

    invoice = Invoice.objects.create(
        rsvp=rsvp,
        number=number,
        status=Invoice.STATUS_PAID,
        **supplier,
        customer_name=customer_name,
        customer_address=customer_address,
        customer_ico=customer_ico,
        customer_dic=customer_dic,
        customer_email=user.email,
        items=[
            {
                "label": rsvp.event.title,
                "qty": 1,
                "unit_price": str(amount),
                "subtotal": str(amount),
            }
        ],
        subtotal=amount,
        vat_rate=0,
        vat_amount=0,
        total=amount,
        currency=currency,
        variable_symbol=rsvp.variable_symbol,
    )
    return invoice


class EventChecklistItem(models.Model):
    """Owner-defined task on an event roadmap.

    Pairs with the auto-derived items computed in events.checklist —
    those don't live in the DB because they're a function of the
    event's current state. These are the manual extras the owner adds
    ("Sehnat dopravu", "Připravit prezentaci", ...).

    `category` lets us colour/group items in the UI without coupling
    to a fixed taxonomy — `risk`, `gear`, `comms`, `logistics`, or any
    custom label the owner picks.
    """

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="checklist_items"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(
        max_length=40,
        blank=True,
        default="",
        help_text="Free-text grouping label (risk / gear / comms / ...).",
    )
    done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    REMIND_AUDIENCE_CREATOR = "creator"
    REMIND_AUDIENCE_PARTICIPANTS = "participants"
    REMIND_AUDIENCE_CHOICES = [
        (REMIND_AUDIENCE_CREATOR, "Creator (owner-only e-mail)"),
        (REMIND_AUDIENCE_PARTICIPANTS, "Participants (RSVP'd users + owner)"),
    ]
    remind_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When to dispatch the reminder e-mail. Null = no reminder.",
    )
    remind_audience = models.CharField(
        max_length=20,
        choices=REMIND_AUDIENCE_CHOICES,
        default=REMIND_AUDIENCE_CREATOR,
    )
    remind_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Stamped after dispatch_due_reminders sends the mail.",
    )

    class Meta:
        db_table = "events_checklist_item"
        ordering = ["done", "sort_order", "created_at"]
        indexes = [
            models.Index(fields=["event", "done"]),
            models.Index(
                fields=["remind_at", "remind_sent_at"],
                name="checklist_due_idx",
            ),
        ]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        # Stamp done_at automatically when toggled to True.
        if self.done and self.done_at is None:
            self.done_at = timezone.now()
        elif not self.done:
            self.done_at = None
        super().save(*args, **kwargs)


class EventCollaborator(models.Model):
    """User who can manage one specific event without being a workspace
    admin. Use case: 3-person trip team — all three see + edit the
    event from their own Tvůrce surface; only one of them owns the
    workspace.

    V1 is binary — collaborators have full operational parity with
    the workspace owner *on that event* (edit content, approve RSVPs,
    issue invoices, send reminders). Scope-flag rollout (sekretářka
    edits faktury only) is V2.
    """

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="collaborators"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="event_collaborations",
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="added_event_collaborators",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "events_event_collaborator"
        unique_together = [("event", "user")]
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.user} on {self.event}"


def _maybe_schedule_auto_contract(rsvp: "RSVP") -> None:
    """Po commitu RSVP transakce zaplánuje auto-send Smlouvy přes Celery
    pokud má event smlouvu s `auto_send_after_rsvp=True`.

    Soft import — když app `contracts` z nějakého důvodu chybí (test
    fixture, migrations bootstrap), no-op. Když broker není dostupný
    (dev bez Redis), spadne tiše — Celery EAGER mód v testech zvládne
    sám sync provedení.
    """
    try:
        from contracts.tasks import auto_send_contract_for_rsvp_task
    except ImportError:
        return

    rsvp_id = rsvp.pk

    def _enqueue() -> None:
        import contextlib as _ctx

        try:
            auto_send_contract_for_rsvp_task.apply_async(args=[rsvp_id])
        except Exception:
            with _ctx.suppress(Exception):
                auto_send_contract_for_rsvp_task(rsvp_id)

    transaction.on_commit(_enqueue)
