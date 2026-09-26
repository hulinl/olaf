from django.contrib import admin, messages
from django.core.management import call_command
from django.http import HttpResponseRedirect
from django.urls import path, reverse
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

    change_list_template = "admin/races/syncrun/change_list.html"

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "run-now/",
                self.admin_site.admin_view(self.run_sync_now),
                name="races_syncrun_run_now",
            ),
        ]
        return custom + urls

    def run_sync_now(self, request):
        """Manual admin action — spustí sync okamžitě, redirect zpět
        s message pokud OK / error."""
        from io import StringIO

        buf = StringIO()
        try:
            call_command(
                "sync_races",
                "--source",
                "auto",
                "--triggered-by",
                f"admin:{request.user.email}",
                stdout=buf,
            )
            output = buf.getvalue().strip()
            latest = SyncRun.objects.first()
            summary = (
                f"+{latest.created_count} nových, "
                f"~{latest.updated_count} updatů, "
                f"={latest.skipped_count} beze změny, "
                f"⚠{latest.flagged_count} flagged"
                if latest
                else output
            )
            self.message_user(
                request,
                f"Sync spuštěn: {summary}",
                level=messages.SUCCESS,
            )
        except Exception as exc:
            self.message_user(
                request,
                f"Sync selhal: {exc}",
                level=messages.ERROR,
            )
        return HttpResponseRedirect(
            reverse("admin:races_syncrun_changelist")
        )

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
