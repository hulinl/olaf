"""Register the events.purge_old_soft_deletes periodic task.

Once per day — hard-deletes events that have been in the Trash longer
than 30 days. Daily granularity matches the retention promise we show
in the UI ("smaže se za X dní"). Idempotent like 0025.
"""
from __future__ import annotations

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period="days",
    )
    PeriodicTask.objects.get_or_create(
        name="events.purge_old_soft_deletes",
        defaults={
            "interval": schedule,
            "task": "events.purge_old_soft_deletes",
            "enabled": True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(
        name="events.purge_old_soft_deletes"
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0026_event_deleted_at_event_deleted_by"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, remove_periodic_task),
    ]
