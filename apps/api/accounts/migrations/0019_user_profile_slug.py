"""Add `User.profile_slug` — human-readable URL identifier for
`/u/<profile_slug>` public profile page (2026-09-11).

Non-atomic: první pokus v prod (rev 164) padl s DuplicateTable na
`accounts_user_profile_slug_17f7faf7_like` — Container App restartoval
uprostřed migrace a nechal orphan indexy. S atomic=True se DROP IF
EXISTS smazl při rollbacku a retry lupal do stejné zdi. Přepnutím na
atomic=False + idempotentním RunSQL (IF NOT EXISTS / IF EXISTS) se
migrace zapíše průběžně a je bezpečná pro retry i pro čerstvé DB.
"""
from django.db import migrations, models
from django.utils.text import slugify


def backfill_profile_slugs(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    def make_base(u) -> str:
        base = slugify(f"{u.first_name} {u.last_name}".strip())
        if not base:
            base = slugify(u.email.split("@", 1)[0]) or "user"
        return base[:90]

    taken: set[str] = set(
        User.objects.exclude(profile_slug="").values_list(
            "profile_slug", flat=True
        )
    )
    for user in User.objects.filter(profile_slug="").order_by("pk"):
        base = make_base(user)
        candidate = base
        n = 1
        while candidate in taken:
            n += 1
            candidate = f"{base}-{n}"
        user.profile_slug = candidate
        user.save(update_fields=["profile_slug"])
        taken.add(candidate)


def clear_profile_slugs(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.update(profile_slug="")


ADD_COLUMN_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts_user' AND column_name = 'profile_slug'
    ) THEN
        ALTER TABLE "accounts_user"
        ADD COLUMN "profile_slug" varchar(100) NOT NULL DEFAULT '';
    END IF;
END
$$;
"""

DROP_COLUMN_SQL = 'ALTER TABLE "accounts_user" DROP COLUMN IF EXISTS "profile_slug";'

FINALIZE_SQL = """
DROP INDEX IF EXISTS "accounts_user_profile_slug_17f7faf7_like";
DROP INDEX IF EXISTS "accounts_user_profile_slug_17f7faf7_uniq";
ALTER TABLE "accounts_user"
    DROP CONSTRAINT IF EXISTS "accounts_user_profile_slug_17f7faf7_uniq";
ALTER TABLE "accounts_user"
    ADD CONSTRAINT "accounts_user_profile_slug_17f7faf7_uniq"
    UNIQUE ("profile_slug");
CREATE INDEX IF NOT EXISTS "accounts_user_profile_slug_17f7faf7_like"
    ON "accounts_user" ("profile_slug" varchar_pattern_ops);
"""

FINALIZE_REVERSE_SQL = """
DROP INDEX IF EXISTS "accounts_user_profile_slug_17f7faf7_like";
ALTER TABLE "accounts_user"
    DROP CONSTRAINT IF EXISTS "accounts_user_profile_slug_17f7faf7_uniq";
"""


class Migration(migrations.Migration):
    # Non-atomic: každý step se commituje samostatně, takže retry po
    # container restartu pokračuje odkud přestal místo úplného
    # rollbacku (který nechává orphan DDL v DB).
    atomic = False

    dependencies = [
        ("accounts", "0018_periodic_notify_stuck_users"),
    ]

    operations = [
        # Column přidáváme přes idempotentní SQL, ne AddField — retry
        # po pádu by jinak spadlo na „column already exists".
        # SeparateDatabaseAndState říká Django, že state = SlugField(blank),
        # ale DB práci uděláme sami.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="user",
                    name="profile_slug",
                    field=models.SlugField(
                        blank=True, default="", max_length=100
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=ADD_COLUMN_SQL, reverse_sql=DROP_COLUMN_SQL
                ),
            ],
        ),
        migrations.RunPython(backfill_profile_slugs, clear_profile_slugs),
        # Finální stav: unique + _like index. Idempotentní SQL, takže
        # bezpečné i po částečně provedeném předchozím pokusu.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="user",
                    name="profile_slug",
                    field=models.SlugField(
                        blank=True, max_length=100, unique=True
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
