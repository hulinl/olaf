"""Track when the proactive stuck-user nudge was last sent to a user
so we can dedup notifications (2026-09-11)."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_user_profile_visibility"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="last_stuck_reminder_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
