from django.contrib import admin
from django.utils.html import format_html

from .models import Race, RaceFavorite, SyncRun


@admin.register(Race)
class RaceAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "date_start",
        "distance_km",
        "elevation_m",
        "country",
        "region",
        "series",
        "sport",
        "registration_status",
        "is_visible",
    )
    list_filter = (
        "sport",
        "series",
        "region",
        "registration_status",
        "country",
        "is_visible",
    )
    search_fields = ("name", "location", "country", "highlight")
    date_hierarchy = "date_start"
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("date_start",)


@admin.register(RaceFavorite)
class RaceFavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "race", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("user__email", "race__name")
    ordering = ("-updated_at",)


@admin.register(SyncRun)
class SyncRunAdmin(admin.ModelAdmin):
    """Audit trail pro daily race sync agent."""

    list_display = (
        "created_at_short",
        "source",
        "status_badge",
        "created_count",
        "updated_count",
        "skipped_count",
        "flagged_count",
        "duration_ms",
        "triggered_by",
    )
    list_filter = ("status", "source", "triggered_by", "created_at")
    search_fields = ("error_message",)
    readonly_fields = (
        "created_at",
        "source",
        "source_url",
        "status",
        "created_count",
        "updated_count",
        "skipped_count",
        "flagged_count",
        "duration_ms",
        "triggered_by",
        "error_message",
        "changes_pretty",
    )
    exclude = ("changes",)
    ordering = ("-created_at",)
    date_hierarchy = "created_at"

    @admin.display(description="Kdy", ordering="-created_at")
    def created_at_short(self, obj):
        return obj.created_at.strftime("%d.%m. %H:%M")

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {"ok": "#059669", "error": "#dc2626", "partial": "#d97706"}
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{}; color:white; padding:2px 8px; '
            'border-radius:3px; font-size:11px; font-weight:600; '
            'text-transform:uppercase;">{}</span>',
            color,
            obj.get_status_display(),
        )

    @admin.display(description="Změny")
    def changes_pretty(self, obj):
        if not obj.changes:
            return format_html("<em>Žádné změny</em>")
        rows = []
        for c in obj.changes[:50]:
            rows.append(
                format_html(
                    "<tr><td><code>{}</code></td><td>{}</td>"
                    '<td style="color:#dc2626;">{}</td>'
                    '<td style="color:#059669;">{}</td></tr>',
                    c.get("slug", ""),
                    c.get("field", ""),
                    str(c.get("old", ""))[:60],
                    str(c.get("new", ""))[:60],
                )
            )
        table = format_html(
            '<table style="border-collapse:collapse; font-size:12px;">'
            '<thead><tr><th style="padding:4px 8px;">Race</th>'
            '<th style="padding:4px 8px;">Field</th>'
            '<th style="padding:4px 8px;">Old</th>'
            '<th style="padding:4px 8px;">New</th></tr></thead>'
            "<tbody>{}</tbody></table>",
            format_html("".join(rows)),
        )
        note = ""
        if len(obj.changes) > 50:
            note = format_html(
                '<p style="color:#6b7280; font-size:11px; margin-top:8px;">'
                "… + {} dalších změn zkráceno.</p>",
                len(obj.changes) - 50,
            )
        return format_html("{}{}", table, note)
