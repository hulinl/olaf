"""Public profile visibility toggles (2026-09-10)."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0015_user_avatar_focal_zoom"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="profile_show_email",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="user",
            name="profile_show_phone",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="profile_show_address",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="profile_show_avatar",
            field=models.BooleanField(default=True),
        ),
    ]
