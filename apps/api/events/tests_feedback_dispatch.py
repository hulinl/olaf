"""Tests for the post-event feedback dispatcher (2026-09-11).

Task hledá confirmed non-organizer RSVPs jejichž event doběhl mezi
24 a 72 hodinami zpět a ještě nedostaly feedback mail. Odpovídá
memory `project_olaf_email_polish` — user pušel „feedback po akci"
až explicit ask.
"""
from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from workspaces.models import Workspace

from .models import RSVP, Event
from .tasks import dispatch_due_feedback_requests_task


def _make_event(**overrides) -> Event:
    ws = Workspace.objects.create(slug="ws", name="WS")
    starts = overrides.pop("starts_at", timezone.now() - timedelta(days=3))
    ends = overrides.pop("ends_at", timezone.now() - timedelta(days=2))
    defaults = {
        "slug": "ev",
        "title": "Test kemp",
        "starts_at": starts,
        "ends_at": ends,
        "status": Event.STATUS_PUBLISHED,
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=ws, **defaults)


def _make_user(email: str = "u@example.com") -> User:
    return User.objects.create_user(
        email=email,
        password="hike-forest-2026",
        first_name="U",
        last_name="X",
        email_verified=True,
    )


class FeedbackDispatchTests(TestCase):
    def setUp(self) -> None:
        mail.outbox.clear()

    def test_sends_for_confirmed_rsvp_in_window(self) -> None:
        # Event doběhl přesně před 36 h — přesně v okně 24-72.
        event = _make_event(
            ends_at=timezone.now() - timedelta(hours=36),
            starts_at=timezone.now() - timedelta(hours=40),
        )
        user = _make_user()
        rsvp = RSVP.objects.create(
            event=event, user=user, status=RSVP.STATUS_YES
        )
        result = dispatch_due_feedback_requests_task()
        self.assertEqual(result, {"sent": 1})
        self.assertEqual(len(mail.outbox), 1)
        rsvp.refresh_from_db()
        self.assertIsNotNone(rsvp.feedback_sent_at)

    def test_dedupes_via_feedback_sent_at(self) -> None:
        event = _make_event(
            ends_at=timezone.now() - timedelta(hours=36),
            starts_at=timezone.now() - timedelta(hours=40),
        )
        RSVP.objects.create(
            event=event,
            user=_make_user(),
            status=RSVP.STATUS_YES,
            feedback_sent_at=timezone.now() - timedelta(hours=10),
        )
        dispatch_due_feedback_requests_task()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_organizer_rsvp(self) -> None:
        event = _make_event(
            ends_at=timezone.now() - timedelta(hours=36),
            starts_at=timezone.now() - timedelta(hours=40),
        )
        RSVP.objects.create(
            event=event,
            user=_make_user(),
            status=RSVP.STATUS_YES,
            is_organizer=True,
        )
        dispatch_due_feedback_requests_task()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_non_yes_status(self) -> None:
        event = _make_event(
            ends_at=timezone.now() - timedelta(hours=36),
            starts_at=timezone.now() - timedelta(hours=40),
        )
        RSVP.objects.create(
            event=event,
            user=_make_user(),
            status=RSVP.STATUS_CANCELLED,
        )
        dispatch_due_feedback_requests_task()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_event_still_running(self) -> None:
        # Event pořád běží — mail by byl předčasný.
        event = _make_event(
            starts_at=timezone.now() - timedelta(hours=2),
            ends_at=timezone.now() + timedelta(hours=1),
        )
        RSVP.objects.create(
            event=event, user=_make_user(), status=RSVP.STATUS_YES
        )
        dispatch_due_feedback_requests_task()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_event_too_old(self) -> None:
        # Event doběhl před týdnem — po okně 72 h. Uživatel už nebude
        # relevantně reagovat, nespamovat ho.
        event = _make_event(
            ends_at=timezone.now() - timedelta(days=7),
            starts_at=timezone.now() - timedelta(days=7, hours=4),
        )
        RSVP.objects.create(
            event=event, user=_make_user(), status=RSVP.STATUS_YES
        )
        dispatch_due_feedback_requests_task()
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_deleted_event(self) -> None:
        event = _make_event(
            ends_at=timezone.now() - timedelta(hours=36),
            starts_at=timezone.now() - timedelta(hours=40),
            deleted_at=timezone.now(),
        )
        RSVP.objects.create(
            event=event, user=_make_user(), status=RSVP.STATUS_YES
        )
        dispatch_due_feedback_requests_task()
        self.assertEqual(len(mail.outbox), 0)
