"""Idempotently seed the Olaf Adventures workspace.

The PRD (§4.3) defers the "create workspace" UI to V1.5, so the launch
tenant is bootstrapped via this command. Run after `migrate`:

    docker compose exec api python manage.py seed_olaf_adventures

If a superuser exists, the command also adds them as the workspace
Owner. Otherwise the workspace is created without an owner — link a
user via Django admin or by running this command again after creating
the superuser.
"""
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

SEED_SLUG = "olafadventures"
SEED_NAME = "Olaf Adventures"
SEED_BIO = (
    "Outdoor community based in the Beskydy mountains. Multi-day camps, "
    "training events, group runs — the whole crew."
)
SEED_LOCATION = "Beskydy, Czech Republic"
SEED_SOCIAL_LINKS = {"web": "https://olafadventures.com"}
SEED_ACCENT_COLOR = "#000000"
SEED_TZ = "Europe/Prague"
SEED_VISIBILITY = Workspace.VISIBILITY_PUBLIC
SEED_LOGO_PATH = (
    Path(settings.BASE_DIR) / "seed_assets" / "olaf_adventures" / "logo.jpg"
)


class Command(BaseCommand):
    help = "Seed the Olaf Adventures tenant workspace."

    def handle(self, *args, **options) -> None:
        workspace, created = Workspace.objects.get_or_create(
            slug=SEED_SLUG,
            defaults={
                "name": SEED_NAME,
                "bio": SEED_BIO,
                "location": SEED_LOCATION,
                "social_links": SEED_SOCIAL_LINKS,
                "accent_color": SEED_ACCENT_COLOR,
                "default_tz": SEED_TZ,
                "visibility": SEED_VISIBILITY,
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created workspace '{SEED_NAME}'."))
        else:
            self.stdout.write(f"Workspace '{SEED_NAME}' already exists — skipping create.")

        # Attach logo asset if available and not already set.
        if SEED_LOGO_PATH.exists() and not workspace.logo:
            with SEED_LOGO_PATH.open("rb") as f:
                workspace.logo.save("olaf-adventures-logo.jpg", File(f), save=True)
            self.stdout.write(self.style.SUCCESS("Attached seed logo."))
        elif not SEED_LOGO_PATH.exists():
            self.stdout.write(
                self.style.WARNING(
                    f"Seed logo not found at {SEED_LOGO_PATH}; skipping."
                )
            )

        # Assign the first superuser as Owner if one exists.
        superuser = User.objects.filter(is_superuser=True).order_by("id").first()
        if superuser is None:
            self.stdout.write(
                self.style.WARNING(
                    "No superuser found — workspace has no Owner yet. "
                    "Create one (`python manage.py createsuperuser`) and re-run."
                )
            )
            return

        membership, member_created = WorkspaceMember.objects.get_or_create(
            workspace=workspace,
            user=superuser,
            defaults={"role": WorkspaceMember.ROLE_OWNER},
        )
        if member_created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Added {superuser.email} as Owner of '{SEED_NAME}'."
                )
            )

        # Default the superuser's active_workspace to this one if unset.
        if superuser.active_workspace_id is None:
            superuser.active_workspace = workspace
            superuser.save(update_fields=["active_workspace"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"Set {superuser.email}'s active workspace to '{SEED_NAME}'."
                )
            )

        self.stdout.write(self.style.SUCCESS("Seed complete."))
