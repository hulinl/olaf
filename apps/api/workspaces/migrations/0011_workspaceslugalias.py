"""Add WorkspaceSlugAlias — historický slug po přejmenování komunity.

Pattern kopíruje EventSlugAlias (events.0041). Signal pre_save na
Workspace vytvoří alias při každém rename; frontend page.tsx pak 308
přeposílá na canonical slug.
"""
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0010_event_sharing_policy"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceSlugAlias",
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
                ("old_slug", models.SlugField(max_length=50, unique=True)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="slug_aliases",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={
                "db_table": "workspaces_slug_alias",
                "indexes": [
                    models.Index(
                        fields=["old_slug"],
                        name="workspaces__old_slu_idx",
                    ),
                ],
            },
        ),
    ]
