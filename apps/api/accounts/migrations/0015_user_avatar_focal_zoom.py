"""Avatar focal-point + zoom for the User profile photo (2026-09-10).

Ships alongside a shared PhotoEditor component reused from the hero
cover editor so profile pictures can be recentred + zoomed the same
way.
"""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0014_user_avatar_imagefield"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar_focal_x",
            field=models.FloatField(default=50.0),
        ),
        migrations.AddField(
            model_name="user",
            name="avatar_focal_y",
            field=models.FloatField(default=50.0),
        ),
        migrations.AddField(
            model_name="user",
            name="avatar_zoom",
            field=models.FloatField(default=100.0),
        ),
    ]
