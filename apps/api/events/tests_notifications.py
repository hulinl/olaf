"""Bell-feed fan-out from event-side triggers.

Covers `notify_event_updated`, `notify_rsvp_approved`,
`notify_rsvp_rejected` — the three event-app helpers that create
Notification rows when the owner saves an event change or processes
a pending registration.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from notifications.models import Notification
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event
from .notifications import (
    diff_changed_fields,
    notify_event_updated,
    notify_rsvp_approved,
    notify_rsvp_rejected,
    snapshot_event_for_diff,
)


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, **overrides) -> Event:
    starts = overrides.pop("starts_at", timezone.now() + timedelta(days=14))
    defaults = {
        "slug": "ev",
        "title": "Camp",
        "starts_at": starts,
        "ends_at": overrides.pop("ends_at", starts + timedelta(hours=4)),
        "status": Event.STATUS_PUBLISHED,
        "location_text": "Beskydy",
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=ws, **defaults)


class EventUpdateNotificationTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@u.com")
        self.participant = _make_user("p@u.com")
        self.other = _make_user("other@u.com")
        self.ws = _make_workspace(self.owner)
        self.event = _make_event(self.ws)
        RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        # An RSVP that's been cancelled — must NOT receive notifications.
        RSVP.objects.create(
            event=self.event,
            user=self.other,
            status=RSVP.STATUS_CANCELLED,
        )

    def test_diff_picks_up_starts_at_change(self) -> None:
        before = snapshot_event_for_diff(self.event)
        self.event.starts_at = self.event.starts_at + timedelta(days=1)
        after = snapshot_event_for_diff(self.event)
        self.assertEqual(diff_changed_fields(before, after), ["starts_at"])

    def test_no_change_no_notifications(self) -> None:
        before = snapshot_event_for_diff(self.event)
        after = snapshot_event_for_diff(self.event)  # unchanged
        n = notify_event_updated(
            self.event, diff_changed_fields(before, after), actor=self.owner
        )
        self.assertEqual(n, 0)
        self.assertEqual(Notification.objects.count(), 0)

    def test_active_rsvped_user_gets_notification(self) -> None:
        n = notify_event_updated(
            self.event, ["location_text"], actor=self.owner
        )
        self.assertEqual(n, 1)
        notif = Notification.objects.get(recipient=self.participant)
        self.assertEqual(notif.kind, Notification.KIND_EVENT_UPDATE)
        self.assertIn("Místo", notif.body)
        self.assertEqual(notif.payload["changed_fields"], ["location_text"])

    def test_cancelled_rsvp_does_not_receive(self) -> None:
        notify_event_updated(self.event, ["status"], actor=self.owner)
        self.assertFalse(
            Notification.objects.filter(recipient=self.other).exists()
        )

    def test_draft_event_does_not_notify(self) -> None:
        self.event.status = Event.STATUS_DRAFT
        self.event.save()
        n = notify_event_updated(
            self.event, ["location_text"], actor=self.owner
        )
        self.assertEqual(n, 0)

    def test_actor_excluded(self) -> None:
        # The owner is also a participant — make them an active RSVP too.
        RSVP.objects.create(
            event=self.event, user=self.owner, status=RSVP.STATUS_YES
        )
        notify_event_updated(self.event, ["location_text"], actor=self.owner)
        # Only the non-owner participant should get a notification.
        recipients = list(
            Notification.objects.values_list("recipient_id", flat=True)
        )
        self.assertIn(self.participant.id, recipients)
        self.assertNotIn(self.owner.id, recipients)

    def test_termin_label_dedupes_when_both_dates_change(self) -> None:
        # starts_at + ends_at both map to "Termín" — body should
        # contain it once, not twice.
        notify_event_updated(
            self.event, ["starts_at", "ends_at"], actor=self.owner
        )
        notif = Notification.objects.get(recipient=self.participant)
        self.assertEqual(notif.body.count("Termín"), 1)

    def test_opted_out_participant_skipped(self) -> None:
        # User toggled "Upozorňovat na změny v akci" off → no rows
        # created for them.
        self.participant.notify_on_event_update = False
        self.participant.save()
        n = notify_event_updated(
            self.event, ["location_text"], actor=self.owner
        )
        self.assertEqual(n, 0)
        self.assertFalse(
            Notification.objects.filter(recipient=self.participant).exists()
        )


class RsvpApproveRejectNotificationTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("ownerar@u.com")
        self.applicant = _make_user("applicant@u.com")
        self.ws = _make_workspace(self.owner, slug="arws")
        self.event = _make_event(self.ws, slug="ar-event")
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.applicant,
            status=RSVP.STATUS_PENDING_APPROVAL,
        )

    def test_approved_creates_notification_for_applicant(self) -> None:
        notify_rsvp_approved(self.rsvp)
        notif = Notification.objects.get(recipient=self.applicant)
        self.assertEqual(notif.kind, Notification.KIND_RSVP_APPROVED)
        self.assertIn("Schváleno", notif.title)
        self.assertIn("Camp", notif.title)

    def test_rejected_creates_notification_with_reason(self) -> None:
        notify_rsvp_rejected(self.rsvp, reason="Plno.")
        notif = Notification.objects.get(recipient=self.applicant)
        self.assertEqual(notif.kind, Notification.KIND_RSVP_REJECTED)
        self.assertIn("Zamítnuto", notif.title)
        self.assertIn("Plno.", notif.body)

    def test_rejected_without_reason(self) -> None:
        notify_rsvp_rejected(self.rsvp)
        notif = Notification.objects.get(recipient=self.applicant)
        # Falls back to the generic message when no reason supplied.
        self.assertIn("zamítl", notif.body.lower())

    def test_opted_out_applicant_gets_no_notification(self) -> None:
        # notify_on_rsvp_status=False suppresses both approve + reject.
        self.applicant.notify_on_rsvp_status = False
        self.applicant.save()
        approved = notify_rsvp_approved(self.rsvp)
        rejected = notify_rsvp_rejected(self.rsvp)
        self.assertIsNone(approved)
        self.assertIsNone(rejected)
        self.assertEqual(
            Notification.objects.filter(recipient=self.applicant).count(),
            0,
        )

    def test_rsvp_without_user_id_no_notification(self) -> None:
        # Belt-and-braces: if a future migration adds nullable user_id
        # (light accounts) the helpers must skip cleanly. Simulate by
        # blanking user_id in-memory without saving.
        self.rsvp.user = None
        self.rsvp.user_id = None  # type: ignore[assignment]
        self.assertIsNone(notify_rsvp_approved(self.rsvp))
        self.assertIsNone(notify_rsvp_rejected(self.rsvp))
        self.assertEqual(Notification.objects.count(), 0)
