"""Add `User.profile_slug` — human-readable URL identifier for
`/u/<profile_slug>` public profile page (2026-09-11).

Migration order:
  1. Add nullable slug field (schema change, no unique yet).
  2. Backfill: pro každého existujícího usera vygeneruj slug.
  3. Přepni na unique + non-null.
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


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0018_periodic_notify_stuck_users"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="profile_slug",
            field=models.SlugField(
                blank=True,
                default="",
                max_length=100,
            ),
        ),
        migrations.RunPython(backfill_profile_slugs, clear_profile_slugs),
        migrations.AlterField(
            model_name="user",
            name="profile_slug",
            field=models.SlugField(
                blank=True,
                db_index=True,
                max_length=100,
                unique=True,
            ),
        ),
    ]
