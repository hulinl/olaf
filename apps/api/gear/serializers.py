from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from rest_framework import serializers

from .models import GearItem, GearList, GearListItem


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
    display_url = serializers.SerializerMethodField()

    class Meta:
        model = GearItem
        fields = (
            "id", "name", "weight_g", "url", "display_url",
            "category", "note", "created_at", "updated_at",
        )
        read_only_fields = ("id", "display_url", "created_at", "updated_at")

    def get_display_url(self, obj: GearItem) -> str:
        partners = getattr(obj.user, "affiliate_partners", None) or []
        return _apply_affiliate_partners(obj.url, partners)


class GearListEntrySerializer(serializers.ModelSerializer):
    """Inlined entry inside a list. Surfaces the full item so the UI
    can render name + weight without a join lookup."""

    item = GearItemSerializer(read_only=True)
    item_id = serializers.PrimaryKeyRelatedField(
        queryset=GearItem.objects.all(), source="item", write_only=True
    )

    class Meta:
        model = GearListItem
        fields = ("id", "item", "item_id", "quantity", "sort_order", "note")
        read_only_fields = ("id",)


class GearListSerializer(serializers.ModelSerializer):
    entries = GearListEntrySerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    total_weight_g = serializers.SerializerMethodField()

    class Meta:
        model = GearList
        fields = (
            "id", "name", "description", "entries", "item_count",
            "total_weight_g", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "entries", "item_count", "total_weight_g",
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
