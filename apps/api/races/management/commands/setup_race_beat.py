"""Nastaví periodic task `races.sync_races` v django-celery-beat DB
scheduleru. Idempotentní — dvakrát spuštění neduplikuje.

Spouštěj jednou při setup/deploy:
    python manage.py setup_race_beat
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django_celery_beat.models import IntervalSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Registruje daily race calendar sync task v Celery beat."

    def handle(self, *args, **options) -> None:
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=1,
            period=IntervalSchedule.DAYS,
        )
        task, created = PeriodicTask.objects.get_or_create(
            name="races.sync_daily",
            defaults={
                "task": "races.sync_races",
                "interval": schedule,
                "enabled": True,
                "description": "Denní resync race calendar dat z seed snapshotu.",
            },
        )
        if not created:
            task.task = "races.sync_races"
            task.interval = schedule
            task.enabled = True
            task.save()
        action = "vytvořen" if created else "aktualizován"
        self.stdout.write(
            self.style.SUCCESS(f"Periodic task `races.sync_daily` {action}.")
        )
