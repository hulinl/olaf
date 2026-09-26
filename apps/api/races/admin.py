from django.contrib import admin

from .models import Race, RaceFavorite


@admin.register(Race)
class RaceAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "date_start",
        "distance_km",
        "elevation_m",
        "country",
        "series",
        "registration_status",
        "is_visible",
    )
    list_filter = ("series", "registration_status", "country", "is_visible")
    search_fields = ("name", "location", "country", "highlight")
    date_hierarchy = "date_start"
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("date_start",)


@admin.register(RaceFavorite)
class RaceFavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "race", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__email", "race__name")
    ordering = ("-created_at",)
