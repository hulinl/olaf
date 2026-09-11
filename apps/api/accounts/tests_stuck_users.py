"""Tests for the proactive stuck-user notification (2026-09-11)."""
from datetime import timedelta
from io import StringIO

from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import User


class NotifyStuckUsersCommandTests(TestCase):
    """Command should target users who prošli signup, ale zůstali stuck
    na verify kroku (has_usable_password + unverified + dost stará
    signup). Idempotent přes `last_stuck_reminder_at` cooldown."""

    def setUp(self) -> None:
        mail.outbox.clear()
        self.now = timezone.now()

    def _make_user(self, **kwargs):
        defaults = {
            "email": "test@example.com",
            "password": "hike-forest-2026",
            "first_name": "Test",
            "last_name": "User",
        }
        defaults.update(kwargs)
        return User.objects.create_user(**defaults)

    def _run(self, dry_run: bool = False) -> str:
        out = StringIO()
        call_command("notify_stuck_users", dry_run=dry_run, stdout=out)
        return out.getvalue()

    def test_sends_to_recently_stuck_user(self) -> None:
        u = self._make_user()
        # Signup před 5 hodinami (víc než MIN_HOURS_AFTER_SIGNUP=2).
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(hours=5),
        )
        out = self._run()
        self.assertIn("Notification sent to 1", out)
        self.assertEqual(len(mail.outbox), 1)
        u.refresh_from_db()
        self.assertIsNotNone(u.last_stuck_reminder_at)

    def test_skips_fresh_signup(self) -> None:
        # Signup před 30 minutami — user pořád má šanci verifikovat sám.
        u = self._make_user()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(minutes=30),
        )
        self._run()
        self.assertEqual(len(mail.outbox), 0)
        u.refresh_from_db()
        self.assertIsNone(u.last_stuck_reminder_at)

    def test_skips_verified_user(self) -> None:
        u = self._make_user()
        u.email_verified = True
        u.save()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(hours=5),
        )
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_light_user_without_password(self) -> None:
        # Anon RSVP flow: user má email, ale nemá heslo — nikdy neprošel
        # signupem, takže by ho mail „dokončíš setup" zmátl.
        u = self._make_user(email="anon@example.com")
        u.set_unusable_password()
        u.save()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(hours=5),
        )
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_respects_cooldown(self) -> None:
        # User právě dostal nudge — nesmí dostat druhý za 48 h.
        u = self._make_user()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(hours=5),
            last_stuck_reminder_at=self.now - timedelta(hours=10),
        )
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_sends_again_after_cooldown(self) -> None:
        u = self._make_user()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(days=5),
            last_stuck_reminder_at=self.now - timedelta(hours=72),
        )
        self._run()
        self.assertEqual(len(mail.outbox), 1)

    def test_dry_run_does_not_send(self) -> None:
        u = self._make_user()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(hours=5),
        )
        out = self._run(dry_run=True)
        self.assertIn("Dry run: 1", out)
        self.assertEqual(len(mail.outbox), 0)
        u.refresh_from_db()
        self.assertIsNone(u.last_stuck_reminder_at)
