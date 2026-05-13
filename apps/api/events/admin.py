from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "workspace",
        "starts_at",
        "ends_at",
        "status",
        "visibility",
        "capacity",
    )
    list_filter = ("status", "visibility", "workspace")
    search_fields = ("title", "slug", "workspace__name")
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ("workspace",)
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "starts_at"
    fieldsets = (
        (None, {"fields": ("workspace", "title", "slug", "status", "visibility")}),
        ("Content", {"fields": ("description", "cover")}),
        (
            "When + where",
            {
                "fields": (
                    "starts_at",
                    "ends_at",
                    "tz",
                    "location_text",
                    "meeting_point_text",
                    "location_url",
                )
            },
        ),
        (
            "Capacity",
            {"fields": ("capacity", "waitlist_enabled", "requires_approval")},
        ),
        ("Cancellation", {"fields": ("cancellation_reason",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
