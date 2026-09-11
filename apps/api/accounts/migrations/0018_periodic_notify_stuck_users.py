"""Register accounts.notify_stuck_users periodic task (2026-09-11).

Denně 09:00 CET (v UTC 07:00 v létě, 08:00 v zimě — použijeme UTC 08:00
jako kompromis, e-mail v podpolední Praze). Idempotent: get_or_create
nezaduplikuje pokud migrace poběží dvakrát.
"""
from __future__ import annotations

from django.db import migrations


def create_periodic_task(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="8",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
    )
    PeriodicTask.objects.get_or_create(
        name="accounts.notify_stuck_users",
        defaults={
            "crontab": schedule,
            "task": "accounts.notify_stuck_users",
            "enabled": True,
            "description": (
                "Denně proaktivně připomene stuck unverified userům, "
                "aby dokončili signup (viz user report 2026-09-11)."
            ),
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="accounts.notify_stuck_users").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0017_user_last_stuck_reminder_at"),
        ("django_celery_beat", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, remove_periodic_task),
    ]
