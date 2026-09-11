"""EventSlugAlias — historický slug pro Event po rename. Signal
`create_slug_alias_on_rename` (events/signals.py) vytvoří alias
automaticky při Event.slug změně; view `_load_published_event`
fallback-uje na alias při 404 a vrací redirect signál pro klienta.
User request 2026-09-11.
"""
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0040_periodic_feedback_dispatch"),
        ("workspaces", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="EventSlugAlias",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("old_slug", models.SlugField(max_length=200)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "event",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="slug_aliases",
                        to="events.event",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="event_slug_aliases",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={
                "db_table": "events_slug_alias",
                "indexes": [
                    models.Index(
                        fields=["workspace", "old_slug"],
                        name="events_slug_workspa_1e9b2f_idx",
                    ),
                ],
                "unique_together": {("workspace", "old_slug")},
            },
        ),
    ]
