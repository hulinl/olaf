# Generated for the event import endpoint — adds external_ref column +
# partial-unique index per workspace (blank refs are skipped).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0031_event_require_phone_on_rsvp'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='external_ref',
            field=models.CharField(
                blank=True,
                default='',
                help_text=(
                    "Stable identifier from the external system that produced "
                    "this event (e.g. 'beskydy-spring-camp-2026'). Used by the "
                    "import endpoint to upsert instead of duplicate."
                ),
                max_length=120,
            ),
        ),
        migrations.AddConstraint(
            model_name='event',
            constraint=models.UniqueConstraint(
                condition=models.Q(('external_ref__gt', '')),
                fields=('workspace', 'external_ref'),
                name='unique_workspace_external_ref',
            ),
        ),
    ]
