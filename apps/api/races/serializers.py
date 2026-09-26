from __future__ import annotations

from rest_framework import serializers

from .models import Race, RaceFavorite


class RaceSerializer(serializers.ModelSerializer):
    """Public race payload — includes `is_favorite` bool + user's plan
    status (nebo null) spočtený per requesting user, aby frontend
    nemusel dělat druhý fetch mine/."""

    is_favorite = serializers.SerializerMethodField()
    plan_status = serializers.SerializerMethodField()
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
            "next_label",
            "next_year",
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
            "registration_detail",
            "is_top",
            "has_warning",
            "highlight",
            "is_favorite",
            "plan_status",
        ]
        read_only_fields = fields

    def _fav_lookup(self) -> dict[int, str] | None:
        return self.context.get("user_favorite_status")

    def get_is_favorite(self, obj: Race) -> bool:
        lookup = self._fav_lookup()
        if lookup is not None:
            return obj.id in lookup
        user = self.context.get("request").user if self.context.get("request") else None
        if not user or not user.is_authenticated:
            return False
        return obj.favorites.filter(user=user).exists()

    def get_plan_status(self, obj: Race) -> str | None:
        lookup = self._fav_lookup()
        if lookup is not None:
            return lookup.get(obj.id)
        user = self.context.get("request").user if self.context.get("request") else None
        if not user or not user.is_authenticated:
            return None
        fav = obj.favorites.filter(user=user).first()
        return fav.status if fav else None

    def get_elevation_per_km(self, obj: Race) -> float | None:
        return obj.elevation_per_km


class RaceFavoriteSerializer(serializers.ModelSerializer):
    """Race plan entry — user's status + note + embedded race payload
    pro one-shot listing (např. `/api/races/mine/` a public profile)."""

    race = RaceSerializer(read_only=True)

    class Meta:
        model = RaceFavorite
        fields = ["status", "note", "created_at", "updated_at", "race"]
        read_only_fields = ["created_at", "updated_at", "race"]
