from __future__ import annotations

from rest_framework import serializers

from .models import Race


class RaceSerializer(serializers.ModelSerializer):
    """Public race payload — includes `is_favorite` bool spočtený per
    requesting user, aby frontend nemusel dělat druhý fetch mine/."""

    is_favorite = serializers.SerializerMethodField()
    elevation_per_km = serializers.SerializerMethodField()

    class Meta:
        model = Race
        fields = [
            "id",
            "slug",
            "name",
            "date_start",
            "date_end",
            "date_display",
            "distance_km",
            "distances_note",
            "elevation_m",
            "elevation_per_km",
            "terrain",
            "sport",
            "location",
            "country",
            "region",
            "url",
            "series",
            "registration_status",
            "highlight",
            "is_favorite",
        ]
        read_only_fields = fields

    def get_is_favorite(self, obj: Race) -> bool:
        user = self.context.get("request").user if self.context.get("request") else None
        if not user or not user.is_authenticated:
            return False
        favorites_lookup = self.context.get("user_favorite_ids")
        if favorites_lookup is not None:
            return obj.id in favorites_lookup
        return obj.favorites.filter(user=user).exists()

    def get_elevation_per_km(self, obj: Race) -> float | None:
        return obj.elevation_per_km
