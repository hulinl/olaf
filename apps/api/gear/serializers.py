from rest_framework import serializers

from .models import GearItem, GearList, GearListItem


class GearItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = GearItem
        fields = (
            "id", "name", "weight_g", "url", "category", "note",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


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
