"""Register the audit.purge_old periodic task.

Once per day — same cadence as events.purge_old_soft_deletes (which
this migration mirrors). Idempotent: get_or_create won't double-add
on re-run.
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
        name="audit.purge_old",
        defaults={
            "interval": schedule,
            "task": "audit.purge_old",
            "enabled": True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="audit.purge_old").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("audit", "0001_initial"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, remove_periodic_task),
    ]
