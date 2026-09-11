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
        self.assertIn("Dry run: 1 signup", out)
        self.assertEqual(len(mail.outbox), 0)
        u.refresh_from_db()
        self.assertIsNone(u.last_stuck_reminder_at)


class NotifyStuckUsersAnonRsvpTests(TestCase):
    """2. větev commandu (2026-09-11): user prošel anon RSVP formulář,
    dostal light account (unusable password, unverified), nikdy
    nedokončil signup. Command mu pošle „vytvoř si účet" mail
    s pre-fillovaným e-mailem místo verify tokenu."""

    def setUp(self) -> None:
        mail.outbox.clear()
        self.now = timezone.now()

    def _make_light_user(self, email: str = "anon@example.com") -> User:
        # Anon RSVP flow (accounts.views._create_light_user) vytvoří
        # user bez usable password.
        u = User.objects.create(
            email=email,
            first_name="Anon",
            last_name="Rsvp",
        )
        u.set_unusable_password()
        u.save()
        return u

    def _make_rsvp(self, user: User, hours_ago: int) -> None:
        from datetime import timedelta as td

        from events.models import RSVP, Event
        from workspaces.models import Workspace

        ws = Workspace.objects.create(slug="ws", name="WS")
        starts = self.now + td(days=7)
        event = Event.objects.create(
            workspace=ws,
            slug="ev",
            title="Kemp",
            starts_at=starts,
            ends_at=starts + td(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        rsvp = RSVP.objects.create(
            event=event,
            user=user,
            status=RSVP.STATUS_YES,
        )
        # created_at je auto — přepiš přes update aby test simuloval
        # starší RSVP.
        RSVP.objects.filter(pk=rsvp.pk).update(
            created_at=self.now - td(hours=hours_ago),
        )

    def _run(self) -> str:
        out = StringIO()
        call_command("notify_stuck_users", stdout=out)
        return out.getvalue()

    def test_sends_anon_rsvp_stuck_user(self) -> None:
        u = self._make_light_user()
        self._make_rsvp(u, hours_ago=48)
        out = self._run()
        self.assertIn("1 anon-RSVP", out)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Dokončíš registraci", mail.outbox[0].subject)
        # Link vede na /signup s prefillovaným e-mailem — user nezadává
        # e-mail znovu.
        self.assertIn(f"email={u.email}", mail.outbox[0].body)
        u.refresh_from_db()
        self.assertIsNotNone(u.last_stuck_reminder_at)

    def test_skips_light_user_without_rsvp(self) -> None:
        # Sám light account bez RSVP nedává smysl nudge-nout — user
        # možná dostal invitation link a nezúčastní se ničeho.
        self._make_light_user()
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_recent_rsvp(self) -> None:
        u = self._make_light_user()
        # RSVP před 5 hodinami — user má šanci sám vyplnit signup.
        self._make_rsvp(u, hours_ago=5)
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_cancelled_only_rsvp(self) -> None:
        from events.models import RSVP, Event
        from workspaces.models import Workspace

        u = self._make_light_user()
        ws = Workspace.objects.create(slug="ws", name="WS")
        event = Event.objects.create(
            workspace=ws,
            slug="ev",
            title="Kemp",
            starts_at=self.now + timedelta(days=7),
            ends_at=self.now + timedelta(days=7, hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        rsvp = RSVP.objects.create(
            event=event, user=u, status=RSVP.STATUS_CANCELLED
        )
        RSVP.objects.filter(pk=rsvp.pk).update(
            created_at=self.now - timedelta(hours=48)
        )
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_verified_light_user_skipped(self) -> None:
        # Extrémní edge case: light user co byl verified (např. admin
        # manual override). Nudge nemá smysl.
        u = self._make_light_user()
        u.email_verified = True
        u.save()
        self._make_rsvp(u, hours_ago=48)
        self._run()
        self.assertEqual(len(mail.outbox), 0)

    def test_shares_cooldown_with_signup_stuck(self) -> None:
        # Kdyby user měl current usable password (což by nemělo být
        # v anon-RSVP flow, ale test drží gate) a taky měl RSVP starší
        # 24 h, dostane jen jeden mail, ne dva.
        u = self._make_light_user()
        u.set_password("hike-2026")  # najednou má password
        u.save()
        User.objects.filter(pk=u.pk).update(
            date_joined=self.now - timedelta(hours=5),
        )
        self._make_rsvp(u, hours_ago=48)
        self._run()
        # Dostane 1 mail (signup přednost — je logičtější), ne 2.
        self.assertEqual(len(mail.outbox), 1)
