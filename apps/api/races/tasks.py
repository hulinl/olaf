"""Race calendar background tasks — daily sync agent.

Registered v Celery beat přes django-celery-beat (viz DB scheduler).
Nastav ručně jednou v Django adminu (Periodic Tasks):
- Name: „races sync daily"
- Task: `races.sync_races`
- Interval: 1 day
- Enabled: True

Nebo přes management command:
    python manage.py setup_race_beat  (viz níže)
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger("races")


@shared_task(name="races.sync_races")
def sync_races_task() -> dict:
    """Volá `python manage.py sync_races`. Vrací count summary.
    V prod běží EAGER (viz project_olaf_perf_celery_eager memory),
    takže je synchronní. Když bude beat trigger, provede se v beat
    workeru (django-celery-beat + Redis)."""
    from io import StringIO

    buf = StringIO()
    call_command("sync_races", stdout=buf)
    output = buf.getvalue()
    logger.info("sync_races: %s", output.strip())
    return {"output": output.strip()}
