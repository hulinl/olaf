from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import EmailVerificationToken, PasswordResetToken, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "first_name", "last_name", "email_verified", "is_staff", "date_joined")
    list_filter = ("email_verified", "is_staff", "is_superuser", "is_active")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("-date_joined",)
    readonly_fields = ("date_joined", "updated_at", "last_login")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identity", {"fields": ("first_name", "last_name", "display_name")}),
        ("Contact", {"fields": ("phone", "dob", "avatar_blob_id", "address")}),
        (
            "Emergency contact",
            {
                "fields": (
                    "emergency_contact_name",
                    "emergency_contact_phone",
                    "emergency_contact_relationship",
                )
            },
        ),
        ("Activity & experience", {"fields": ("fitness_level", "sport_tags", "bio")}),
        (
            "Permissions",
            {
                "fields": (
                    "email_verified",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined", "updated_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "first_name", "last_name", "password1", "password2"),
            },
        ),
    )


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "used_at", "is_usable")
    list_filter = ("used_at",)
    search_fields = ("user__email", "token")
    readonly_fields = ("token", "created_at", "used_at")


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "used_at", "is_usable")
    list_filter = ("used_at",)
    search_fields = ("user__email", "token")
    readonly_fields = ("token", "created_at", "used_at")
