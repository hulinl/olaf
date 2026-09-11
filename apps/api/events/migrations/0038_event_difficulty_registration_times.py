"""Public API v2 fields (2026-09-11) — difficulty + registration
opens/closes so external consumers (olafadventures.cz) can render
"planned" state and per-event difficulty badges."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0037_eventcosting_eventcostitem"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="difficulty",
            field=models.CharField(
                blank=True,
                choices=[
                    ("light", "Lehká"),
                    ("moderate", "Střední"),
                    ("hard", "Náročná"),
                    ("extreme", "Extrémní"),
                ],
                default="",
                help_text=(
                    "Náročnost — používá veřejné API a externí weby."
                ),
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="event",
            name="registration_opens_at",
            field=models.DateTimeField(
                blank=True,
                help_text=(
                    "Kdy se otevírá registrace. Null = otevřeno hned po "
                    "publikaci (default V1 chování)."
                ),
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="event",
            name="registration_closes_at",
            field=models.DateTimeField(
                blank=True,
                help_text=(
                    "Kdy se registrace uzavírá. Null = otevřeno až do "
                    "začátku akce (default V1 chování)."
                ),
                null=True,
            ),
        ),
    ]
