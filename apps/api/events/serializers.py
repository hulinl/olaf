"""DRF serializers for events + RSVPs."""
from __future__ import annotations

from rest_framework import serializers

from .blocks import BlockValidationError, validate_blocks
from .models import RSVP, Event, EventImage, RSVPDocument

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

    # `None` (= caller nepředal vůbec nic) padáme na full set jako
    # legacy default. Prázdný `[]` ale znamená "vědomě nic" a respekt-
    # neme to — owner si vypnul všechny sekce a nechce ten chtít po
    # uživateli kompletní vyplnění. Předtím tu byl `or fallback`, což
    # falsy [] padlo na plný seznam a backend pak vyžadoval všechno.
    if enabled_sections is None:
        enabled_sections = list(SECTION_FIELDS.keys())
    enabled = set(enabled_sections)
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


class EventImageSerializer(serializers.ModelSerializer):
    """Single gallery image — id, image URL, alt, sort order."""

    url = serializers.SerializerMethodField()

    class Meta:
        model = EventImage
        fields = ("id", "url", "alt_text", "sort_order")
        read_only_fields = fields

    def get_url(self, obj: EventImage) -> str | None:
        return obj.image.url if obj.image else None


class EventPublicSerializer(serializers.ModelSerializer):
    """Public-facing event payload for /api/events/{ws}/{slug}/."""

    images = EventImageSerializer(many=True, read_only=True)
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
    community_slugs = serializers.SerializerMethodField()
    shared_workspace_slugs = serializers.SerializerMethodField()
    gear_lists_by_slug = serializers.SerializerMethodField()
    recommended_gear_list = serializers.SerializerMethodField()
    risk_checklist = serializers.SerializerMethodField()

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
            "require_phone_on_rsvp",
            "visibility",
            "status",
            "requires_approval",
            "community_slugs",
            "shared_workspace_slugs",
            "blocks",
            "gear_lists_by_slug",
            "recommended_gear_list",
            "risk_checklist",
            "enabled_questionnaire_sections",
            "images",
            "workspace_slug",
            "workspace_name",
            "workspace_logo_url",
            "workspace_accent_color",
            "confirmed_count",
            "is_open_for_rsvp",
            "is_at_capacity",
            "remaining_capacity",
            "cancellation_reason",
            "price_amount",
            "price_currency",
            "price_note",
            "payment_in_cash",
            "billing_profile",
            "required_documents",
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

    def get_community_slugs(self, obj: Event) -> list[str]:
        return list(obj.communities.values_list("slug", flat=True))

    def get_shared_workspace_slugs(self, obj: Event) -> list[str]:
        return list(obj.shared_workspaces.values_list("slug", flat=True))

    def get_risk_checklist(self, obj: Event) -> list:
        """Owner-only: risk checklist is internal prep, not for the
        public landing. Return an empty list to non-managers so the
        field's shape stays stable (FE always reads as array)."""
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            from .permissions import can_manage_event

            if can_manage_event(request.user, obj):
                return list(obj.risk_checklist or [])
        return []

    def get_recommended_gear_list(self, obj: Event) -> dict | None:
        """Slim payload for the public "Doporučené vybavení" section
        + the participant checklist. Just id, name, slug, and entries
        with bare item name + category — no URLs, weights, or notes
        (those leak the owner's specific picks; we want the generic
        gear plan visible to everyone). Owner-side admin views still
        get the full GearList via the normal gear endpoints."""
        if obj.recommended_gear_list_id is None:
            return None
        gl = obj.recommended_gear_list
        entries = []
        for e in gl.entries.select_related("item").order_by(
            "sort_order", "id"
        ):
            entries.append(
                {
                    "id": e.id,
                    "name": e.item.name,
                    "category": e.item.category,
                    "quantity": e.quantity,
                }
            )
        return {
            "id": gl.id,
            "name": gl.name,
            "slug": gl.slug,
            "entries": entries,
        }

    def get_gear_lists_by_slug(self, obj: Event) -> dict:
        """Inline payload for every gear block on this event's landing.

        Maps slug → PublicGearList payload (slim) when the list is
        unlisted or public. Private lists are omitted, so the block
        renders gracefully empty if the owner switches a list back to
        private after attaching it."""
        slugs: list[str] = []
        for block in obj.blocks or []:
            if not isinstance(block, dict) or block.get("type") != "gear":
                continue
            slug = ((block.get("payload") or {}).get("list_slug") or "").strip()
            if slug:
                slugs.append(slug)
        if not slugs:
            return {}

        from gear.models import GearList
        from gear.serializers import PublicGearListSerializer

        qs = (
            GearList.objects.select_related("user")
            .prefetch_related("entries__item")
            .filter(slug__in=slugs)
            .exclude(visibility=GearList.VISIBILITY_PRIVATE)
        )
        return {
            gl.slug: PublicGearListSerializer(gl).data for gl in qs
        }


class EventSummarySerializer(serializers.ModelSerializer):
    """Compact event payload — for owner event lists and dashboard widgets."""

    cover_url = serializers.SerializerMethodField()
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    confirmed_count = serializers.IntegerField(
        source="confirmed_rsvp_count", read_only=True
    )
    waitlist_count = serializers.IntegerField(read_only=True)
    pending_approval_count = serializers.IntegerField(read_only=True)

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
            "pending_approval_count",
            "price_amount",
            "price_currency",
            "price_note",
            "deleted_at",
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
        # `enabled` může být:
        #   - None: context vůbec není (např. v testech bez kontextu) →
        #     padáme zpátky na všechny sekce, validátor je strict.
        #   - []: explicitně prázdný (owner si vypnul všechny sekce) →
        #     žádná sekce není required. Předtím tu bylo `enabled or
        #     fallback`, což falsy [] padlo na full list a backend pak
        #     chtěl všechny pole, i když frontend nic neposlal. User
        #     po anon RSVP dostal "answers.tshirt_size: required".
        #   - list[str]: jen vyjmenované sekce.
        enabled = (self.context or {}).get("event_sections")
        if enabled is None:
            enabled = list(SECTION_FIELDS.keys())
        validator_cls = build_questionnaire_serializer(enabled)
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
    uploaded_doc_keys = serializers.SerializerMethodField()
    verified_doc_keys = serializers.SerializerMethodField()
    invoice_id = serializers.SerializerMethodField()
    duplicate_hints = serializers.SerializerMethodField()

    class Meta:
        model = RSVP
        fields = (
            "id",
            "status",
            "is_organizer",
            "user_email",
            "user_full_name",
            "user_phone",
            "questionnaire_answers",
            "waitlist_position",
            "attended",
            "payment_status",
            "payment_due_amount",
            "payment_currency",
            "variable_symbol",
            "paid_at",
            "uploaded_doc_keys",
            "verified_doc_keys",
            "invoice_id",
            "duplicate_hints",
            "cancellation_reason",
            "cancelled_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_uploaded_doc_keys(self, obj: RSVP) -> list[str]:
        return list(obj.documents.values_list("key", flat=True).distinct())

    def get_verified_doc_keys(self, obj: RSVP) -> list[str]:
        return list(
            obj.documents.filter(verified_at__isnull=False)
            .values_list("key", flat=True)
            .distinct()
        )

    def get_invoice_id(self, obj: RSVP) -> int | None:
        try:
            return obj.invoice.id
        except Exception:
            return None

    def get_duplicate_hints(self, obj: RSVP) -> list[str]:
        """Surfaces precomputed hints from the view layer (it builds
        one map per request rather than per-row to avoid n+1). When
        the context doesn't carry the precomputed map — e.g. the
        single-RSVP detail flow — we silently fall back to an empty
        list."""
        hints_map = (self.context or {}).get("duplicate_hints_map") or {}
        return hints_map.get(obj.id, [])


class MyRSVPSerializer(serializers.ModelSerializer):
    """RSVP as seen by the participant themselves."""

    class Meta:
        model = RSVP
        fields = (
            "id",
            "status",
            "questionnaire_answers",
            "waitlist_position",
            "payment_status",
            "payment_due_amount",
            "payment_currency",
            "variable_symbol",
            "paid_at",
            "gear_checklist",
            "created_at",
        )
        read_only_fields = fields


class EventWriteSerializer(serializers.ModelSerializer):
    """Used for both create + update by workspace Owners."""

    community_slugs = serializers.ListField(
        child=serializers.SlugField(),
        required=False,
        write_only=True,
        help_text="Slugs of Communities to share the event into.",
    )
    shared_workspace_slugs = serializers.ListField(
        child=serializers.SlugField(),
        required=False,
        write_only=True,
        help_text=(
            "Slugs of additional Workspaces (komunity) where this event "
            "should be visible. Validated server-side against owner status."
        ),
    )

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
            "require_phone_on_rsvp",
            "visibility",
            "status",
            "requires_approval",
            "community_slugs",
            "shared_workspace_slugs",
            "blocks",
            "enabled_questionnaire_sections",
            "cancellation_reason",
            "price_amount",
            "price_currency",
            "price_note",
            "payment_in_cash",
            "billing_profile",
            "required_documents",
            "recommended_gear_list",
            "risk_checklist",
        )

    def validate_risk_checklist(self, value):
        """Owner-managed list. Each item must be a dict with key,
        label, category (string), status (open|done|na), notes."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Musí být seznam.")
        valid_status = {"open", "done", "na"}
        cleaned = []
        seen_keys: set[str] = set()
        for i, item in enumerate(value):
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    f"Položka #{i} musí být objekt."
                )
            key = (item.get("key") or "").strip()
            label = (item.get("label") or "").strip()
            if not key or not label:
                raise serializers.ValidationError(
                    f"Položka #{i}: vyplň 'key' i 'label'."
                )
            if key in seen_keys:
                raise serializers.ValidationError(
                    f"Položka #{i}: duplicitní key '{key}'."
                )
            seen_keys.add(key)
            status = (item.get("status") or "open").strip().lower()
            if status not in valid_status:
                status = "open"
            cleaned.append(
                {
                    "key": key,
                    "label": label[:200],
                    "category": (item.get("category") or "").strip()[:40],
                    "status": status,
                    "notes": (item.get("notes") or "").strip()[:1000],
                }
            )
        return cleaned

    def validate_recommended_gear_list(self, value):
        """Owner can only attach their own GearLists. Anything else is
        a 400 rather than a silent ignore."""
        if value is None:
            return None
        request = self.context.get("request")
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError(
                "Tenhle gear list ti nepatří."
            )
        return value

    def validate_required_documents(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Musí být seznam.")
        seen_keys: set[str] = set()
        cleaned = []
        for i, item in enumerate(value):
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    f"Položka #{i} musí být objekt."
                )
            key = (item.get("key") or "").strip()
            label = (item.get("label") or "").strip()
            required = bool(item.get("required", True))
            if not key or not label:
                raise serializers.ValidationError(
                    f"Položka #{i}: vyplň 'key' i 'label'."
                )
            if key in seen_keys:
                raise serializers.ValidationError(
                    f"Položka #{i}: duplicitní key '{key}'."
                )
            seen_keys.add(key)
            cleaned.append({"key": key, "label": label, "required": required})
        return cleaned

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

    def validate_blocks(self, value):
        try:
            validate_blocks(value)
        except BlockValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc
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


class RSVPDocumentSerializer(serializers.ModelSerializer):
    """Single uploaded document. URL is built from FileField storage."""

    url = serializers.SerializerMethodField()

    class Meta:
        model = RSVPDocument
        fields = (
            "id",
            "key",
            "url",
            "original_name",
            "uploaded_at",
            "verified_at",
        )
        read_only_fields = fields

    def get_url(self, obj) -> str | None:
        try:
            return obj.file.url
        except Exception:
            return None


from .models import Invoice  # noqa: E402


class InvoiceSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="rsvp.user.email", read_only=True)
    user_full_name = serializers.CharField(
        source="rsvp.user.get_full_name", read_only=True
    )
    event_title = serializers.CharField(source="rsvp.event.title", read_only=True)
    has_qr = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "number",
            "status",
            "supplier_name",
            "supplier_address",
            "supplier_ico",
            "supplier_dic",
            "supplier_iban",
            "customer_name",
            "customer_address",
            "customer_ico",
            "customer_dic",
            "customer_email",
            "items",
            "subtotal",
            "vat_rate",
            "vat_amount",
            "total",
            "currency",
            "variable_symbol",
            "issued_at",
            "due_at",
            "notes",
            "has_qr",
            "user_email",
            "user_full_name",
            "event_title",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "number",
            "has_qr",
            "user_email",
            "user_full_name",
            "event_title",
            "created_at",
            "updated_at",
        )

    def get_has_qr(self, obj: Invoice) -> bool:
        """True when the QR endpoint will be able to produce a PNG —
        i.e. there's an IBAN (snapshot or workspace fallback) + amount."""
        iban = obj.supplier_iban or obj.rsvp.event.workspace.payment_iban
        return bool(iban and obj.total)


from .models import EventChecklistItem  # noqa: E402


class EventChecklistItemSerializer(serializers.ModelSerializer):
    """Manual checklist item — owner-created task on an event."""

    class Meta:
        model = EventChecklistItem
        fields = (
            "id",
            "title",
            "description",
            "category",
            "done",
            "done_at",
            "sort_order",
            "remind_at",
            "remind_audience",
            "remind_sent_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "done_at",
            "remind_sent_at",
            "created_at",
            "updated_at",
        )

    def update(self, instance, validated_data):
        # If owner changes remind_at, clear the "already sent" stamp so the
        # next dispatcher tick will pick the item up again.
        if (
            "remind_at" in validated_data
            and validated_data["remind_at"] != instance.remind_at
        ):
            instance.remind_sent_at = None
        return super().update(instance, validated_data)
