import secrets
from datetime import timedelta

from django.conf import settings
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
    # Legacy single-line address — kept so old data doesn't get dropped.
    # New code reads/writes address_street / address_city / ... below.
    address = models.CharField(max_length=500, blank=True)

    # Structured address (for invoice generation, contracts, mailings).
    address_street = models.CharField(max_length=200, blank=True)
    address_city = models.CharField(max_length=120, blank=True)
    address_zip = models.CharField(max_length=20, blank=True)
    address_country = models.CharField(max_length=2, blank=True, default="CZ")

    # Optional separate billing address. has_billing_address gates whether
    # the billing_* fields are used on invoices; otherwise we use address_*.
    has_billing_address = models.BooleanField(default=False)
    billing_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Company / person to bill (e.g. employer for B2B).",
    )
    billing_ico = models.CharField(max_length=15, blank=True)
    billing_dic = models.CharField(max_length=15, blank=True)
    billing_street = models.CharField(max_length=200, blank=True)
    billing_city = models.CharField(max_length=120, blank=True)
    billing_zip = models.CharField(max_length=20, blank=True)
    billing_country = models.CharField(max_length=2, blank=True, default="CZ")

    # Emergency contact
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)
    emergency_contact_relationship = models.CharField(max_length=100, blank=True)

    # Affiliate partner configuration for gear lists. Stored as a list
    # of {"domain": "alza.cz", "params": {"ref": "MY_ID"}} entries.
    # When the gear-item serializer renders a URL, it checks the
    # outbound domain against this list and appends matching params,
    # giving the user a per-shop affiliate handle without per-item
    # URL editing.
    affiliate_partners = models.JSONField(default=list, blank=True)

    # Activity & experience
    fitness_level = models.CharField(max_length=20, choices=FITNESS_LEVEL_CHOICES, blank=True)
    sport_tags = models.JSONField(default=list, blank=True)
    bio = models.TextField(blank=True)

    # Performance metrics (used by RSVP forms for prefill).
    pace_10k = models.CharField(
        max_length=20,
        blank=True,
        help_text='Čas na 10 km na rovince, např. "55:00".',
    )
    weekly_km = models.PositiveIntegerField(
        null=True, blank=True, help_text="Průměrný týdenní objem v km."
    )
    longest_run = models.CharField(
        max_length=50,
        blank=True,
        help_text='Nejdelší souvislý běh, např. "21 km", "půlmaraton".',
    )
    fitness_note = models.TextField(
        blank=True,
        help_text="Krátká poznámka — cíl na sezónu, oblíbený typ běhání, …",
    )

    # Diet (used by RSVP forms for prefill).
    DIET_OMNIVORE = "omnivore"
    DIET_VEGETARIAN = "vegetarian"
    DIET_VEGAN = "vegan"
    DIET_OTHER = "other"
    DIET_CHOICES = [
        (DIET_OMNIVORE, "Omnivore"),
        (DIET_VEGETARIAN, "Vegetarian"),
        (DIET_VEGAN, "Vegan"),
        (DIET_OTHER, "Other"),
    ]
    diet = models.CharField(max_length=20, choices=DIET_CHOICES, blank=True)
    diet_note = models.TextField(blank=True, help_text="Alergie, intolerance, …")

    # Apparel (used by RSVP forms for prefill).
    tshirt_size = models.CharField(
        max_length=8,
        blank=True,
        help_text="XS / S / M / L / XL / XXL",
    )

    # Workspace context — which workspace is the user currently "in".
    # Multi-workspace switching is V1.5; in V1 this defaults to the user's
    # only workspace (if any).
    active_workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    # Auth + lifecycle
    email_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    # Notification preferences (Slice 12 — discussion notify).
    notify_on_discussion_reply = models.BooleanField(
        default=True,
        help_text="Email me when someone replies on a topic I started.",
    )
    notify_on_discussion_announce = models.BooleanField(
        default=True,
        help_text=(
            "Email me when a new topic appears in a komunita I'm a member "
            "of, or on an event I'm RSVP'd to."
        ),
    )
    notify_on_discussion_mention = models.BooleanField(
        default=True,
        help_text=(
            "Bell + e-mail when someone @-mentions me in a comment. "
            "Independent of the reply opt-out — mentions are louder."
        ),
    )
    notify_on_event_update = models.BooleanField(
        default=True,
        help_text=(
            "Bell + e-mail when the organiser of an event I've RSVPed "
            "to changes a participant-visible field (date, location, "
            "price, etc.)."
        ),
    )
    notify_on_rsvp_status = models.BooleanField(
        default=True,
        help_text=(
            "Bell when the owner approves or rejects my pending "
            "registration."
        ),
    )

    # Third-party integrations (V2.1+). Stored encrypted at rest via
    # accounts.integrations.encrypt_token; raw value never crosses the
    # API boundary back to the client — frontend only ever sees
    # "connected: bool".
    notion_integration_token_encrypted = models.TextField(
        blank=True,
        default="",
        help_text=(
            "Fernet-encrypted Notion internal integration token. "
            "Used to fetch Notion pages when ingesting an event from "
            "a URL. User generates the token at notion.so/profile/"
            "integrations and pastes it into settings → integrace."
        ),
    )
    anthropic_api_key_encrypted = models.TextField(
        blank=True,
        default="",
        help_text=(
            "Fernet-encrypted Anthropic API key. Per-user so each "
            "creator's LLM calls go on their own bill — no shared "
            "platform key, no admin gating. User generates the key at "
            "console.anthropic.com and pastes into settings → integrace."
        ),
    )

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

    @property
    def profile_completion(self) -> dict:
        """Which of the V1 "minimal profile" fields are still empty.

        Surfaced to the frontend so we can nudge the user with a ! on
        their avatar / profile until they fill the basics in. We don't
        block anything on incomplete profiles — invoicing + emergency
        contact + receipt prefills just degrade gracefully without
        them.

        Address counts as complete if EITHER the structured triple
        (street + city + zip) is filled OR the legacy single-line
        `address` has content. We accept either so older accounts that
        only filled the legacy field don't get re-prompted.
        """
        missing: list[dict] = []
        if not (self.first_name and self.first_name.strip()):
            missing.append({"key": "first_name", "label": "Jméno"})
        if not (self.last_name and self.last_name.strip()):
            missing.append({"key": "last_name", "label": "Příjmení"})
        if not (self.phone and self.phone.strip()):
            missing.append({"key": "phone", "label": "Telefon"})
        has_structured_address = bool(
            (self.address_street or "").strip()
            and (self.address_city or "").strip()
            and (self.address_zip or "").strip()
        )
        has_legacy_address = bool((self.address or "").strip())
        if not (has_structured_address or has_legacy_address):
            missing.append({"key": "address", "label": "Adresa"})
        return {
            "is_complete": len(missing) == 0,
            "missing": missing,
        }


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


class BillingProfile(models.Model):
    """A creator's billing identity — what appears as "Dodavatel" on
    invoices they issue. Each creator can keep multiple profiles
    (e.g. personal IČO + s.r.o.) and pick one per event."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="billing_profiles",
    )
    label = models.CharField(
        max_length=80,
        help_text='Krátký popisek — např. "Osobně" / "Olaf Adventures s.r.o.".',
    )
    legal_name = models.CharField(
        max_length=200,
        help_text="Jméno / název firmy, jak má být na faktuře.",
    )
    ico = models.CharField(max_length=15, blank=True, default="")
    dic = models.CharField(max_length=15, blank=True, default="")
    address_street = models.CharField(max_length=200, blank=True, default="")
    address_city = models.CharField(max_length=120, blank=True, default="")
    address_zip = models.CharField(max_length=20, blank=True, default="")
    address_country = models.CharField(max_length=2, blank=True, default="CZ")
    iban = models.CharField(max_length=34, blank=True, default="")
    bank_name = models.CharField(max_length=80, blank=True, default="")
    is_default = models.BooleanField(
        default=False,
        help_text=(
            "Default profile pre-selected when the user creates a new "
            "paid event. Only one default per user."
        ),
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_billingprofile"
        ordering = ["-is_default", "label"]
        indexes = [models.Index(fields=["user", "is_default"])]

    def __str__(self) -> str:
        return f"{self.label} ({self.legal_name})"

    def save(self, *args, **kwargs):
        # Enforce single default per user.
        if self.is_default:
            BillingProfile.objects.filter(
                user=self.user, is_default=True
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)



class APIToken(models.Model):
    """Personal access token for the OLAF JSON API.

    Issued from /settings/integrations/ for use by external clients —
    notably the mountain-guide Claude Code skill that publishes a
    pre-built event landing into OLAF without touching the browser.
    Multiple tokens per user (separate notebook / CI / per-skill
    tokens) so revoking one doesn't kick the rest. Plaintext token is
    returned exactly once on creation; afterwards only the prefix
    (first 8 chars) is shown for identification.

    Stored as plaintext (DRF authtoken pattern, not hashed) because we
    look up by key on every authenticated request. DB compromise =
    other bigger problems, so the entropy budget goes into the token
    itself (256 bits via secrets.token_urlsafe).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_tokens",
    )
    label = models.CharField(
        max_length=80,
        help_text='User-picked nickname, e.g. "mountain-guide laptop".',
    )
    key = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        default=_generate_token,
    )
    created_at = models.DateTimeField(default=timezone.now)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "accounts_apitoken"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "revoked_at"])]

    def __str__(self) -> str:
        return f"{self.label} ({self.user_id})"

    @property
    def prefix(self) -> str:
        return self.key[:8] if self.key else ""

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def revoke(self) -> None:
        if self.revoked_at is None:
            self.revoked_at = timezone.now()
            self.save(update_fields=["revoked_at"])

    def touch(self) -> None:
        """Bump last_used_at on auth. Debounced to ~1/minute so a busy
        skript doesn't write to this row on every request."""
        now = timezone.now()
        if (
            self.last_used_at is None
            or (now - self.last_used_at) > timedelta(minutes=1)
        ):
            self.last_used_at = now
            self.save(update_fields=["last_used_at"])


class PushSubscription(models.Model):
    """A browser Web Push subscription belonging to a user + device.

    The frontend calls PushManager.subscribe(), gets back a
    PushSubscription object (endpoint URL + p256dh public key + auth
    secret), and we POST that here. The backend then uses pywebpush
    to deliver notifications to the endpoint, which Apple / Mozilla /
    Google forward to the user's device.

    One user can have many subscriptions (one per browser/device).
    Endpoint is the natural key — same browser re-subscribing
    overwrites rather than duplicates.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=600, unique=True)
    p256dh = models.CharField(
        max_length=200,
        help_text="ECDH P-256 public key, base64-url encoded.",
    )
    auth = models.CharField(
        max_length=80,
        help_text="Auth secret, base64-url encoded.",
    )
    user_agent = models.CharField(
        max_length=300,
        blank=True,
        default="",
        help_text="Captured at subscription time for the user-facing list.",
    )
    created_at = models.DateTimeField(default=timezone.now)
    last_used_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "accounts_push_subscription"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"PushSubscription #{self.pk} for {self.user_id}"


class OwnerHiddenPerson(models.Model):
    """An owner has explicitly hidden a person from their /admin/lide/
    view.

    Lidé is the cross-workspace CRM view — every user who's RSVPed to
    one of the caller's events appears there by default. After the
    V2 community-membership rebuild the owner can already remove
    individual users from individual workspaces, but Lidé is workspace-
    agnostic; if the user has no RSVPs on any of the owner's events
    they still linger in Lidé as long as they've ever interacted.

    This row says "owner doesn't want to see this person here anymore."
    The target User's account, RSVPs, and memberships are untouched —
    only the owner's own Lidé view filters them out. Undo via DELETE.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="lide_hidden_people",
        help_text="The creator who clicked 'Skrýt z přehledu'.",
    )
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hidden_by_owners",
        help_text="The user being hidden from the owner's Lidé view.",
    )
    hidden_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "accounts_owner_hidden_person"
        unique_together = [("owner", "target")]
        ordering = ["-hidden_at"]
        indexes = [models.Index(fields=["owner", "-hidden_at"])]

    def __str__(self) -> str:
        return f"OwnerHiddenPerson(owner={self.owner_id}, target={self.target_id})"
