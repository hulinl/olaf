"""Proactively remind users who are stuck at the „e-mail verification"
step so they finish signup and don't churn.

Scenario (2026-09-11 incident): user submits anon RSVP → gets a light
account (unusable password, unverified). Sometime later they realise
they want a real account, hit /signup with the same e-mail, backend
does the take-over flow, fires a verification e-mail — but they never
click the link (spam folder, forgotten in the flood, phone glitch).
Next time they try to log in they see 403 and give up.

This command scans for such users and sends them a fresh verification
link with a friendly "just click here to finish" e-mail. Runs from
Celery beat once per day; safe to run manually too. Idempotent: each
user gets at most one nudge per 48 h window (tracked via user field
`last_stuck_reminder_at`).

Usage:
    python manage.py notify_stuck_users              # dry run + send
    python manage.py notify_stuck_users --dry-run    # count only
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from accounts.emails import send_verification_email
from accounts.models import EmailVerificationToken, User

# Kolik hodin nechat mezi signup a prvním nudge — dost na to, aby
# user měl šanci verifikovat sám, ale ne moc aby ho stihl zapomenout.
MIN_HOURS_AFTER_SIGNUP = 2

# Kolik hodin nechat mezi dvěma nudge maily — nechceme spamovat.
COOLDOWN_HOURS = 48


class Command(BaseCommand):
    help = "Pošle 'dokončíš registraci?' nudge stuck unverified userům."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Jen spočítá kolik by poslali, žádný mail neposílá.",
        )

    def handle(self, *args, dry_run: bool = False, **_) -> None:
        now = timezone.now()
        signup_cutoff = now - timedelta(hours=MIN_HOURS_AFTER_SIGNUP)
        cooldown_cutoff = now - timedelta(hours=COOLDOWN_HOURS)

        # Cíl: user má password (=fyzicky prošel signupem), není
        # verified, signup je aspoň MIN_HOURS_AFTER_SIGNUP stará,
        # a buď nikdy nedostal nudge, nebo poslední byl přes 48 h.
        qs = User.objects.filter(
            email_verified=False,
            date_joined__lte=signup_cutoff,
        ).filter(
            Q(last_stuck_reminder_at__isnull=True)
            | Q(last_stuck_reminder_at__lte=cooldown_cutoff)
        )
        # Filtr `has_usable_password` musíme dělat v Pythonu — na
        # Django level je to metoda, ne DB pole.
        candidates = [u for u in qs if u.has_usable_password()]

        if dry_run:
            self.stdout.write(
                f"Dry run: {len(candidates)} stuck users by dostalo nudge."
            )
            for u in candidates:
                self.stdout.write(f"  - {u.email} (signed up {u.date_joined:%Y-%m-%d})")
            return

        sent = 0
        for user in candidates:
            token = EmailVerificationToken.objects.create(user=user)
            try:
                send_verification_email(user, token)
            except Exception as e:
                self.stderr.write(f"send failed for {user.email}: {e}")
                continue
            user.last_stuck_reminder_at = now
            user.save(update_fields=["last_stuck_reminder_at"])
            sent += 1
        self.stdout.write(
            f"Notification sent to {sent} stuck user(s)."
        )
