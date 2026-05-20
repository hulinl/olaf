"""Register the complete_finished_events periodic task.

15-minute interval — coarser than the reminder dispatcher because the
visible effect (dashboard split, status badge) doesn't need second-level
accuracy. Idempotent like 0018.
"""
from __future__ import annotations

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=15,
        period="minutes",
    )
    PeriodicTask.objects.get_or_create(
        name="events.complete_finished_events",
        defaults={
            "interval": schedule,
            "task": "events.complete_finished_events",
            "enabled": True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="events.complete_finished_events").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0024_event_risk_checklist"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, remove_periodic_task),
    ]
