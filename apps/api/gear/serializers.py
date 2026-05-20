from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from rest_framework import serializers

from .models import GearCategory, GearItem, GearList, GearListItem


class GearCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = GearCategory
        fields = ("id", "name", "sort_order", "created_at")
        read_only_fields = ("id", "created_at")


def _apply_affiliate_partners(url: str, partners: list) -> str:
    """Append affiliate query params to a URL when its domain matches
    one of the user's configured partners.

    Partners shape: [{"domain": "alza.cz", "params": {"ref": "MY_ID"}}].
    Domain match is suffix-based so "alza.cz" covers "www.alza.cz".
    Existing query params on the source URL are never overwritten.
    """
    if not url or not partners:
        return url
    try:
        parsed = urlparse(url)
    except Exception:
        return url
    host = (parsed.hostname or "").lower()
    if not host:
        return url
    merged = dict(parse_qsl(parsed.query, keep_blank_values=True))
    matched = False
    for partner in partners:
        domain = (partner.get("domain") or "").strip().lower()
        params = partner.get("params") or {}
        if not domain or not isinstance(params, dict):
            continue
        if host == domain or host.endswith("." + domain):
            for k, v in params.items():
                if k not in merged:
                    merged[k] = str(v)
                    matched = True
    if not matched:
        return url
    return urlunparse(parsed._replace(query=urlencode(merged)))


class GearItemSerializer(serializers.ModelSerializer):
    """Item payload — write accepts either `category_id` (canonical) or a
    free-text `category` string (auto-creates a GearCategory). Read
    returns both: id for dropdown wiring + name for display."""

    display_url = serializers.SerializerMethodField()
    category_id = serializers.IntegerField(
        source="category_obj_id", required=False, allow_null=True
    )
    # Read-only name field (resolved from FK with fallback to legacy
    # string); writes can still use the legacy plain `category` string
    # which we accept in to_internal_value below.
    category = serializers.SerializerMethodField()

    class Meta:
        model = GearItem
        fields = (
            "id", "name", "weight_g", "url", "display_url",
            "category_id", "category", "note", "created_at", "updated_at",
        )
        read_only_fields = ("id", "display_url", "created_at", "updated_at")

    def get_display_url(self, obj: GearItem) -> str:
        partners = getattr(obj.user, "affiliate_partners", None) or []
        return _apply_affiliate_partners(obj.url, partners)

    def get_category(self, obj: GearItem) -> str:
        if obj.category_obj_id and getattr(obj, "category_obj", None):
            return obj.category_obj.name
        return obj.category or ""

    def to_internal_value(self, data):
        # Stash a string `category` (legacy write path) so we can
        # auto-create the matching GearCategory below.
        self._legacy_category_str = None
        if (
            "category_id" not in data
            and isinstance(data.get("category"), str)
        ):
            self._legacy_category_str = data["category"].strip()
        # The base serializer doesn't know about plain `category` —
        # drop it so it doesn't 400 on "extra field".
        cleaned = {k: v for k, v in data.items() if k != "category"}
        # Guard cross-user category access: any category_id must be a
        # row owned by the caller.
        if cleaned.get("category_id"):
            request = self.context.get("request")
            if request and not GearCategory.objects.filter(
                pk=cleaned["category_id"], user=request.user
            ).exists():
                raise serializers.ValidationError(
                    {"category_id": "Neznámá kategorie."}
                )
        return super().to_internal_value(cleaned)

    def _resolve_category(self, user):
        """Returns a GearCategory or None based on what the request gave."""
        if getattr(self, "_legacy_category_str", None):
            name = self._legacy_category_str[:60]
            if not name:
                return None
            cat, _ = GearCategory.objects.get_or_create(
                user=user, name=name
            )
            return cat
        return None  # category_obj_id already handled by ModelSerializer

    def create(self, validated_data):
        user = validated_data.get("user") or self.context["request"].user
        item = super().create(validated_data)
        cat = self._resolve_category(user)
        if cat is not None:
            item.category_obj = cat
            item.category = cat.name
            item.save(update_fields=["category_obj", "category"])
        elif item.category_obj_id:
            item.category = item.category_obj.name
            item.save(update_fields=["category"])
        return item

    def update(self, instance, validated_data):
        item = super().update(instance, validated_data)
        cat = self._resolve_category(item.user)
        if cat is not None:
            item.category_obj = cat
            item.category = cat.name
            item.save(update_fields=["category_obj", "category"])
        elif "category_obj_id" in self.initial_data:
            # Explicit category_id was set (possibly to null) — keep the
            # string column in sync.
            item.category = item.category_obj.name if item.category_obj_id else ""
            item.save(update_fields=["category"])
        return item


class GearListEntrySerializer(serializers.ModelSerializer):
    """Inlined entry inside a list. Surfaces the full item so the UI
    can render name + weight without a join lookup."""

    item = GearItemSerializer(read_only=True)
    item_id = serializers.PrimaryKeyRelatedField(
        queryset=GearItem.objects.all(), source="item", write_only=True
    )
    click_count = serializers.SerializerMethodField()

    class Meta:
        model = GearListItem
        fields = (
            "id", "item", "item_id", "quantity", "sort_order", "note",
            "click_count",
        )
        read_only_fields = ("id", "click_count")

    def get_click_count(self, obj: GearListItem) -> int:
        # Public landing requests don't need this count — only owners
        # see it in /settings/gear. The serializer-level annotation
        # would be cheaper but the lists are small (single-digit items
        # typical) so a count() per entry is fine.
        return obj.clicks.count()


class GearListSerializer(serializers.ModelSerializer):
    entries = GearListEntrySerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    total_weight_g = serializers.SerializerMethodField()

    class Meta:
        model = GearList
        fields = (
            "id", "name", "description", "entries", "item_count",
            "total_weight_g", "slug", "visibility",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "entries", "item_count", "total_weight_g", "slug",
            "created_at", "updated_at",
        )

    def get_item_count(self, obj: GearList) -> int:
        return sum(e.quantity for e in obj.entries.all())

    def get_total_weight_g(self, obj: GearList) -> int:
        total = 0
        for e in obj.entries.select_related("item"):
            if e.item.weight_g:
                total += e.item.weight_g * e.quantity
        return total


class PublicGearListSerializer(serializers.ModelSerializer):
    """Slim payload for the public /gear/<slug> view. Owner attribution
    + entries with affiliate-rewritten display_url, no internal IDs we
    don't need on a public page."""

    entries = GearListEntrySerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    total_weight_g = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = GearList
        fields = (
            "name", "description", "slug", "entries",
            "item_count", "total_weight_g", "owner_name",
            "created_at", "updated_at",
        )

    def get_item_count(self, obj: GearList) -> int:
        return sum(e.quantity for e in obj.entries.all())

    def get_total_weight_g(self, obj: GearList) -> int:
        total = 0
        for e in obj.entries.select_related("item"):
            if e.item.weight_g:
                total += e.item.weight_g * e.quantity
        return total

    def get_owner_name(self, obj: GearList) -> str:
        return obj.user.get_full_name() or obj.user.email
