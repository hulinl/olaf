"""Reference feature (2026-09-14) — přidává:
- `EventFeedback.is_public` — owner toggle „zveřejnit v public
  referencích na landing page proběhlé akce + externí API".
- `EventFeedback.consented_to_publish` — participant sám dal souhlas
  ve feedback formuláři. Bez souhlasu smí owner zveřejnit jen se
  zkráceným jménem („Jana H.").
- Index na (is_public, -created_at) pro rychlé query public references.
"""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0043_event_public_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="eventfeedback",
            name="is_public",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Owner toggle: povolit zobrazení v public referencích.",
            ),
        ),
        migrations.AddField(
            model_name="eventfeedback",
            name="consented_to_publish",
            field=models.BooleanField(
                default=False,
                help_text="Participant sám zaškrtl souhlas se zveřejněním.",
            ),
        ),
        migrations.AddIndex(
            model_name="eventfeedback",
            index=models.Index(
                fields=["is_public", "-created_at"],
                name="events_even_is_publ_idx",
            ),
        ),
    ]
