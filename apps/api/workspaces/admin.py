from django.contrib import admin

from .models import Workspace, WorkspaceMember


class WorkspaceMemberInline(admin.TabularInline):
    model = WorkspaceMember
    extra = 0
    autocomplete_fields = ("user",)


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "visibility", "default_tz", "created_at")
    list_filter = ("visibility",)
    search_fields = ("name", "slug")
    readonly_fields = ("created_at", "updated_at")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [WorkspaceMemberInline]
    fieldsets = (
        (None, {"fields": ("name", "slug", "visibility")}),
        ("Branding", {"fields": ("logo", "cover", "accent_color")}),
        ("Content", {"fields": ("bio", "location", "social_links")}),
        ("Defaults", {"fields": ("default_tz",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    list_display = ("workspace", "user", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("workspace__name", "workspace__slug", "user__email")
    autocomplete_fields = ("workspace", "user")
    readonly_fields = ("created_at",)
