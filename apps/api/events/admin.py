from django.contrib import admin

from .models import RSVP, Event


class RSVPInline(admin.TabularInline):
    model = RSVP
    extra = 0
    readonly_fields = (
        "user",
        "status",
        "waitlist_position",
        "questionnaire_answers",
        "created_at",
    )
    fields = (*readonly_fields, "attended")
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


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
        "confirmed_count",
    )
    list_filter = ("status", "visibility", "workspace")
    search_fields = ("title", "slug", "workspace__name")
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ("workspace",)
    readonly_fields = ("created_at", "updated_at", "confirmed_count")
    date_hierarchy = "starts_at"
    inlines = [RSVPInline]
    fieldsets = (
        (None, {"fields": ("workspace", "title", "slug", "status", "visibility")}),
        ("Landing content", {"fields": ("description", "cover", "price_text")}),
        (
            "Questionnaire",
            {"fields": ("enabled_questionnaire_sections",)},
        ),
        (
            "Sections (lists)",
            {"fields": ("highlights", "included", "not_included", "program", "faq")},
        ),
        (
            "Additional info",
            {
                "fields": (
                    "additional_cost_note",
                    "difficulty_level",
                    "difficulty_note",
                    "transport_info",
                    "accommodation_info",
                    "gear_info",
                )
            },
        ),
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
            {
                "fields": (
                    "capacity",
                    "waitlist_enabled",
                    "requires_approval",
                    "confirmed_count",
                )
            },
        ),
        ("Cancellation", {"fields": ("cancellation_reason",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def confirmed_count(self, obj: Event) -> int:
        return obj.confirmed_rsvp_count

    confirmed_count.short_description = "Confirmed RSVPs"


@admin.register(RSVP)
class RSVPAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "event",
        "status",
        "waitlist_position",
        "attended",
        "created_at",
    )
    list_filter = ("status", "event__workspace")
    search_fields = ("user__email", "user__first_name", "user__last_name", "event__title")
    autocomplete_fields = ("event", "user")
    readonly_fields = ("created_at", "updated_at", "questionnaire_answers")
    fieldsets = (
        (None, {"fields": ("event", "user", "status", "waitlist_position", "attended")}),
        ("Questionnaire", {"fields": ("questionnaire_answers",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
