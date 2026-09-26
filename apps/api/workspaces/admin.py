from django.contrib import admin

from .models import Workspace, WorkspaceMember


class WorkspaceMemberInline(admin.TabularInline):
    model = WorkspaceMember
    extra = 0
    autocomplete_fields = ("user",)


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "visibility",
        "parent_community",
        "parent_link_status",
        "default_tz",
        "created_at",
    )
    list_filter = ("visibility", "parent_link_status")
    search_fields = ("name", "slug")
    readonly_fields = (
        "created_at",
        "updated_at",
        "parent_requested_by",
        "parent_requested_at",
    )
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ("parent_community",)
    inlines = [WorkspaceMemberInline]
    fieldsets = (
        (None, {"fields": ("name", "slug", "visibility")}),
        ("Branding", {"fields": ("logo", "cover", "accent_color")}),
        ("Content", {"fields": ("bio", "location", "social_links")}),
        ("Defaults", {"fields": ("default_tz",)}),
        (
            "Nested community hierarchy (Slice 2 vize)",
            {
                "fields": (
                    "parent_community",
                    "parent_link_status",
                    "parent_requested_by",
                    "parent_requested_at",
                ),
                "description": (
                    "Když je parent_link_status='active', členové této "
                    "komunity jsou effective members parent komunity "
                    "v race calendaru a parent events se zobrazí i "
                    "návštěvníkům této komunity."
                ),
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    list_display = ("workspace", "user", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("workspace__name", "workspace__slug", "user__email")
    autocomplete_fields = ("workspace", "user")
    readonly_fields = ("created_at",)
