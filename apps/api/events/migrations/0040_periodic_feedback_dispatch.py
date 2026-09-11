"""Register events.dispatch_due_feedback_requests periodic task
(2026-09-11). Kadence 1× za hodinu — task sám filtruje RSVPs okna
24-72 h po ends_at, takže častější spouštění nic nezhorší, jen se
o něco rychleji dostihne k eventům co doběhly.
"""
from __future__ import annotations

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period="hours",
    )
    PeriodicTask.objects.get_or_create(
        name="events.dispatch_due_feedback_requests",
        defaults={
            "interval": schedule,
            "task": "events.dispatch_due_feedback_requests",
            "enabled": True,
            "description": (
                "Post-event feedback nudge. Task hledá RSVPs v okně "
                "24-72 h po ends_at a poprvé (feedback_sent_at is null) "
                "je mailem pobídne."
            ),
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(
        name="events.dispatch_due_feedback_requests"
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0039_rsvp_feedback_sent_at"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, remove_periodic_task),
    ]
