"""Track when feedback e-mail was sent to a participant, so periodic
Celery task doesn't spam them (2026-09-11)."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0038_event_difficulty_registration_times"),
    ]

    operations = [
        migrations.AddField(
            model_name="rsvp",
            name="feedback_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
