from django.contrib import admin

from .models import UserCalendarSource


@admin.register(UserCalendarSource)
class UserCalendarSourceAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "name",
        "enabled",
        "last_synced_at",
        "block_count",
        "last_error_short",
    )
    list_filter = ("enabled",)
    search_fields = ("name", "user__email", "ical_url")
    readonly_fields = (
        "last_synced_at",
        "last_error",
        "busy_blocks",
        "created_at",
        "updated_at",
    )
    autocomplete_fields = ("user",)

    @admin.display(description="Bloků")
    def block_count(self, obj):
        return len(obj.busy_blocks or [])

    @admin.display(description="Poslední chyba")
    def last_error_short(self, obj):
        if len(obj.last_error) > 80:
            return obj.last_error[:80] + "…"
        return obj.last_error
