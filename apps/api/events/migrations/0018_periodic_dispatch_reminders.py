"""Register the dispatch_due_reminders periodic task in django_celery_beat.

Idempotent: uses get_or_create on both IntervalSchedule and PeriodicTask
so re-running the migration (or migrating onto an env where someone
created the row by hand) is safe.
"""
from __future__ import annotations

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period="minutes",
    )
    PeriodicTask.objects.get_or_create(
        name="events.dispatch_due_reminders",
        defaults={
            "interval": schedule,
            "task": "events.dispatch_due_reminders",
            "enabled": True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="events.dispatch_due_reminders").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0017_eventchecklistitem_remind_at_and_more"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, remove_periodic_task),
    ]
