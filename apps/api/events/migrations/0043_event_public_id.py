"""Add Event.public_id — krátký hash pro canonical `/e/<id>` share URL.

Non-atomic + idempotentní (podobný pattern jako accounts.0019). Přidáme
sloupec bez unique constraint, backfillneme existující eventy, přepneme
na unique.
"""
import secrets

from django.db import migrations, models

PUBLIC_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PUBLIC_ID_LEN = 8


def _generate(taken: set[str]) -> str:
    for _ in range(20):
        candidate = "".join(
            secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(PUBLIC_ID_LEN)
        )
        if candidate not in taken:
            return candidate
    raise RuntimeError("public_id generator exhausted retries")


def backfill_public_ids(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    taken: set[str] = set(
        Event.objects.exclude(public_id="").values_list("public_id", flat=True)
    )
    for event in Event.objects.filter(public_id="").only("pk", "public_id"):
        pid = _generate(taken)
        event.public_id = pid
        event.save(update_fields=["public_id"])
        taken.add(pid)


def clear_public_ids(apps, schema_editor):
    Event = apps.get_model("events", "Event")
    Event.objects.update(public_id="")


ADD_COLUMN_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events_event' AND column_name = 'public_id'
    ) THEN
        ALTER TABLE "events_event"
        ADD COLUMN "public_id" varchar(12) NOT NULL DEFAULT '';
    END IF;
END
$$;
"""

DROP_COLUMN_SQL = 'ALTER TABLE "events_event" DROP COLUMN IF EXISTS "public_id";'

FINALIZE_SQL = """
DROP INDEX IF EXISTS "events_event_public_id_uniq";
DROP INDEX IF EXISTS "events_event_public_id_idx";
ALTER TABLE "events_event"
    DROP CONSTRAINT IF EXISTS "events_event_public_id_uniq";
ALTER TABLE "events_event"
    ADD CONSTRAINT "events_event_public_id_uniq"
    UNIQUE ("public_id");
CREATE INDEX IF NOT EXISTS "events_event_public_id_idx"
    ON "events_event" ("public_id");
"""

FINALIZE_REVERSE_SQL = """
DROP INDEX IF EXISTS "events_event_public_id_idx";
ALTER TABLE "events_event"
    DROP CONSTRAINT IF EXISTS "events_event_public_id_uniq";
"""


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("events", "0042_clean_kopie_slugs"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="event",
                    name="public_id",
                    field=models.CharField(
                        blank=True, default="", max_length=12
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=ADD_COLUMN_SQL, reverse_sql=DROP_COLUMN_SQL
                ),
            ],
        ),
        migrations.RunPython(backfill_public_ids, clear_public_ids),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="event",
                    name="public_id",
                    field=models.CharField(
                        blank=True, db_index=True, max_length=12, unique=True
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=FINALIZE_SQL, reverse_sql=FINALIZE_REVERSE_SQL
                ),
            ],
        ),
    ]
