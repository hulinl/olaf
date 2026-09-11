"""Proactively remind users who are stuck at the „e-mail verification"
step so they finish signup and don't churn.

Dva typy stuck userů (2026-09-11 rozšíření):

  A) **Signup stuck** — user prošel /signup, dostal password + verify
     mail, ale neklikl. `has_usable_password() and not email_verified`,
     signup starší 2 h. Fresh verify token, „dokončíš svoji
     registraci?" mail (`send_verification_email`).

  B) **Anon-RSVP stuck** — user vyplnil anonymní RSVP formulář na
     akci, dostal light account bez hesla. Nikdy nedokončil signup.
     `has_unusable_password() and not email_verified`, má non-cancelled
     RSVP starší 24 h. Mail vede na `/signup?email=<email>`
     (`send_finish_signup_email`).

Oba typy sdílí cooldown pole `User.last_stuck_reminder_at` — jeden
user dostane max 1 mail za 48 h bez ohledu na typ.

Runs from Celery beat 1x denně; safe to run manually too.

Usage:
    python manage.py notify_stuck_users              # send
    python manage.py notify_stuck_users --dry-run    # count only
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from accounts.emails import send_finish_signup_email, send_verification_email
from accounts.models import EmailVerificationToken, User

# Kolik hodin nechat mezi signup a prvním nudge — user má šanci
# verifikovat sám, ale ne moc aby ho stihl zapomenout. Signup flow.
MIN_HOURS_AFTER_SIGNUP = 2

# Kolik hodin nechat mezi anon RSVP a nudge — RSVP flow. Delší okno,
# aby user zpracoval potvrzení a případně si sám prošel signup.
MIN_HOURS_AFTER_ANON_RSVP = 24

# Kolik hodin nechat mezi dvěma nudge maily — nechceme spamovat.
COOLDOWN_HOURS = 48


class Command(BaseCommand):
    help = "Pošle nudge stuck unverified userům (signup i anon-RSVP)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Jen spočítá kolik by poslali, žádný mail neposílá.",
        )

    def handle(self, *args, dry_run: bool = False, **_) -> None:
        now = timezone.now()
        cooldown_cutoff = now - timedelta(hours=COOLDOWN_HOURS)

        signup_users = self._find_signup_stuck(
            now=now, cooldown_cutoff=cooldown_cutoff
        )
        anon_rsvp_users = self._find_anon_rsvp_stuck(
            now=now, cooldown_cutoff=cooldown_cutoff
        )
        # Dedup mezi kategoriemi: signup má přednost (má password,
        # fresh verify link je logičtější). V praxi se nemají překrývat
        # (signup má usable password, anon-RSVP nemá), ale gate držíme
        # ať se v budoucnu nezaseknem.
        seen_ids: set[int] = set()

        if dry_run:
            self.stdout.write(
                f"Dry run: {len(signup_users)} signup + "
                f"{len(anon_rsvp_users)} anon-RSVP stuck users."
            )
            for u in signup_users:
                self.stdout.write(f"  signup: {u.email}")
            for u in anon_rsvp_users:
                self.stdout.write(f"  anon-rsvp: {u.email}")
            return

        signup_sent = 0
        for user in signup_users:
            if user.id in seen_ids:
                continue
            token = EmailVerificationToken.objects.create(user=user)
            try:
                send_verification_email(user, token)
            except Exception as e:
                self.stderr.write(f"send signup failed for {user.email}: {e}")
                continue
            user.last_stuck_reminder_at = now
            user.save(update_fields=["last_stuck_reminder_at"])
            seen_ids.add(user.id)
            signup_sent += 1

        anon_sent = 0
        for user in anon_rsvp_users:
            if user.id in seen_ids:
                continue
            try:
                send_finish_signup_email(user)
            except Exception as e:
                self.stderr.write(
                    f"send anon-rsvp failed for {user.email}: {e}"
                )
                continue
            user.last_stuck_reminder_at = now
            user.save(update_fields=["last_stuck_reminder_at"])
            seen_ids.add(user.id)
            anon_sent += 1

        self.stdout.write(
            f"Notifications sent: {signup_sent} signup + "
            f"{anon_sent} anon-RSVP."
        )

    # -----------------------------------------------------------------
    # Candidates
    # -----------------------------------------------------------------

    def _find_signup_stuck(
        self, *, now, cooldown_cutoff
    ) -> list[User]:
        signup_cutoff = now - timedelta(hours=MIN_HOURS_AFTER_SIGNUP)
        qs = User.objects.filter(
            email_verified=False,
            date_joined__lte=signup_cutoff,
        ).filter(
            Q(last_stuck_reminder_at__isnull=True)
            | Q(last_stuck_reminder_at__lte=cooldown_cutoff)
        )
        # `has_usable_password` je metoda, ne DB pole → filtrujeme
        # v Pythonu.
        return [u for u in qs if u.has_usable_password()]

    def _find_anon_rsvp_stuck(
        self, *, now, cooldown_cutoff
    ) -> list[User]:
        from events.models import RSVP

        rsvp_cutoff = now - timedelta(hours=MIN_HOURS_AFTER_ANON_RSVP)
        # Uživatelé s non-cancelled RSVP jejichž nejstarší RSVP je
        # aspoň MIN_HOURS_AFTER_ANON_RSVP h stará. Filtrujeme přes
        # subquery — jeden user, aspoň jedno kvalifikované RSVP.
        candidate_ids = list(
            RSVP.objects.filter(
                created_at__lte=rsvp_cutoff,
            )
            .exclude(status=RSVP.STATUS_CANCELLED)
            .values_list("user_id", flat=True)
            .distinct()
        )
        if not candidate_ids:
            return []
        qs = User.objects.filter(
            id__in=candidate_ids,
            email_verified=False,
        ).filter(
            Q(last_stuck_reminder_at__isnull=True)
            | Q(last_stuck_reminder_at__lte=cooldown_cutoff)
        )
        # Musí NEmít usable password (jinak = signup stuck, obslouží
        # druhá cesta).
        return [u for u in qs if not u.has_usable_password()]
