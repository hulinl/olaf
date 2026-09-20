from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workspaces", "0013_shorten_personal_slugs"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspace",
            name="cover_focal_x",
            field=models.FloatField(default=50.0),
        ),
        migrations.AddField(
            model_name="workspace",
            name="cover_focal_y",
            field=models.FloatField(default=50.0),
        ),
        migrations.AddField(
            model_name="workspace",
            name="cover_zoom",
            field=models.FloatField(default=100.0),
        ),
    ]
