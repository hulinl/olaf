"""Convert legacy `enabled_questionnaire_sections == []` to the full set.

Before this migration an empty list meant "all sections enabled
(backwards compat)" — so when an owner unchecked everything the API
echoed the full default back on the next GET and the UI re-checked
every section. Removing the fallback means we have to backfill the
existing empty rows with the full set so their RSVP form keeps asking
the same questions.

Future events that the owner intentionally clears stay as `[]` and the
form respects that.
"""
from __future__ import annotations

from django.db import migrations


SECTIONS_ALL = [
    "kondice",
    "vykonnost",
    "strava",
    "alergie",
    "zdravotni_poznamky",
    "tisnovy_kontakt",
    "souhlas_s_fotem",
]


def backfill(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    # Only touch rows that genuinely look like "never customized" —
    # empty list. Skip non-empty so deliberately partial selections
    # stay as the owner left them.
    legacy = Event.objects.filter(enabled_questionnaire_sections=[])
    legacy.update(enabled_questionnaire_sections=SECTIONS_ALL)


def unbackfill(apps, schema_editor):
    # Reverse is a no-op — we can't tell post-hoc which rows we touched
    # vs which the owner later edited to match.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0018_periodic_dispatch_reminders"),
    ]

    operations = [migrations.RunPython(backfill, unbackfill)]
