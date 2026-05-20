"""Import gear from a Notion CSV export — CLI entry point.

The parsing + upsert logic lives in gear.imports.import_notion_gear_csv
so the HTTP upload endpoint can share it. This command is a thin shell
that resolves the user, reads the file, optionally dry-runs the parse,
then delegates.

Usage:
    python manage.py import_gear_csv --csv path/to/export.csv \\
        --email user@example.com [--dry-run]
"""
from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from gear.imports import import_notion_gear_csv


class Command(BaseCommand):
    help = "Import a Notion gear-database CSV export into a user's catalog."

    def add_arguments(self, parser):
        parser.add_argument("--csv", required=True, help="Path to the CSV file")
        parser.add_argument(
            "--email",
            required=True,
            help="Owner of the imported catalog (existing User)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse + report but don't write anything",
        )

    def handle(self, *args, **opts):
        csv_path = Path(opts["csv"]).expanduser()
        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        try:
            user = User.objects.get(email__iexact=opts["email"])
        except User.DoesNotExist as e:
            raise CommandError(f"No user with email {opts['email']!r}") from e

        csv_bytes = csv_path.read_bytes()

        if opts["dry_run"]:
            # Parse-only path: peek at counts without writing.
            import csv as _csv
            import io as _io

            text = csv_bytes.decode("utf-8-sig")
            row_count = sum(1 for _ in _csv.DictReader(_io.StringIO(text)))
            self.stdout.write(
                self.style.NOTICE(
                    f"Dry-run: {csv_path.name} → {user.email}: {row_count} rows."
                )
            )
            return

        result = import_notion_gear_csv(user=user, csv_content=csv_bytes)
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. items: +{result.items_created} created, "
                f"{result.items_backfilled} backfilled. "
                f"lists: {result.lists_total}. "
                f"edges: +{result.edges_created}."
            )
        )
