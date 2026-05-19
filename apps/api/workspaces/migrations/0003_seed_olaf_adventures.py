"""Idempotent data migration: seed the Olaf Adventures launch tenant.

Mirrors the seed_olaf_adventures management command so the workspace
exists in every fresh environment (including production) without
needing a remote shell exec. Re-running is safe — get_or_create on
slug, logo only attached if missing.

When a superuser is present, the first one is linked as Owner so the
tenant has a real admin from the start. With no superuser the
workspace is still created (ownerless); admin can be attached later
via Django admin or by re-running once a superuser exists.
"""
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.db import migrations

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


def seed(apps, schema_editor):
    # Skip seeding under the Django test runner — test fixtures
    # create their own "olafadventures" workspace and we'd collide
    # on the unique slug constraint.
    import sys

    if "test" in sys.argv:
        return

    Workspace = apps.get_model("workspaces", "Workspace")
    WorkspaceMember = apps.get_model("workspaces", "WorkspaceMember")
    User = apps.get_model("accounts", "User")

    workspace, _ = Workspace.objects.get_or_create(
        slug=SEED_SLUG,
        defaults={
            "name": SEED_NAME,
            "bio": SEED_BIO,
            "location": SEED_LOCATION,
            "social_links": SEED_SOCIAL_LINKS,
            "accent_color": SEED_ACCENT_COLOR,
            "default_tz": SEED_TZ,
            "visibility": "public",
        },
    )

    logo_path = (
        Path(settings.BASE_DIR) / "seed_assets" / "olaf_adventures" / "logo.jpg"
    )
    if logo_path.exists() and not workspace.logo:
        with logo_path.open("rb") as f:
            workspace.logo.save("olaf-adventures-logo.jpg", File(f), save=True)

    superuser = User.objects.filter(is_superuser=True).order_by("id").first()
    if superuser is not None:
        WorkspaceMember.objects.get_or_create(
            workspace=workspace,
            user=superuser,
            defaults={"role": "owner"},
        )


def unseed(apps, schema_editor):
    # Reverse intentionally leaves the workspace in place — destroying
    # the launch tenant on rollback would orphan every event and RSVP
    # tied to it.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0002_workspace_payment_bank_name_and_more"),
        ("accounts", "0001_initial"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
