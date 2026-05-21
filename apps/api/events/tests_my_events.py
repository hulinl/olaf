"""Coverage for `/api/events/mine/` — the dashboard "Moje akce" feed.

Mirrors the surface area me_todo coverage took on accounts side. The
endpoint is small but the dashboard renders directly from it, so
ordering + cancellation handling are user-visible regressions if
they break.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


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


def _make_event(ws: Workspace, slug: str = "ev", days: int = 14) -> Event:
    starts = timezone.now() + timedelta(days=days)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title=f"E {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


class MyEventsTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@me.com")
        self.me = _make_user("me@me.com")
        self.ws = _make_workspace(self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.url = reverse("events:mine")

    def test_no_rsvps_returns_empty(self) -> None:
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_anon_blocked(self) -> None:
        client = APIClient()
        r = client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_confirmed_rsvp_surfaces(self) -> None:
        event = _make_event(self.ws)
        RSVP.objects.create(
            event=event, user=self.me, status=RSVP.STATUS_YES
        )
        body = self.client.get(self.url).json()
        self.assertEqual([e["slug"] for e in body], [event.slug])

    def test_pending_approval_surfaces(self) -> None:
        # Pending people are still committed to the event in the
        # dashboard sense — they need to track it even though approval
        # is in flight.
        event = _make_event(self.ws)
        RSVP.objects.create(
            event=event,
            user=self.me,
            status=RSVP.STATUS_PENDING_APPROVAL,
        )
        body = self.client.get(self.url).json()
        self.assertEqual([e["slug"] for e in body], [event.slug])

    def test_waitlist_surfaces(self) -> None:
        event = _make_event(self.ws)
        RSVP.objects.create(
            event=event,
            user=self.me,
            status=RSVP.STATUS_WAITLIST,
            waitlist_position=3,
        )
        self.assertEqual(
            [e["slug"] for e in self.client.get(self.url).json()],
            [event.slug],
        )

    def test_cancelled_rsvp_hidden(self) -> None:
        event = _make_event(self.ws)
        RSVP.objects.create(
            event=event,
            user=self.me,
            status=RSVP.STATUS_CANCELLED,
        )
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_orders_by_starts_at_ascending(self) -> None:
        late = _make_event(self.ws, slug="late", days=30)
        soon = _make_event(self.ws, slug="soon", days=3)
        mid = _make_event(self.ws, slug="mid", days=10)
        for e in (late, soon, mid):
            RSVP.objects.create(event=e, user=self.me, status=RSVP.STATUS_YES)
        slugs = [e["slug"] for e in self.client.get(self.url).json()]
        self.assertEqual(slugs, ["soon", "mid", "late"])

    def test_other_users_rsvp_does_not_leak(self) -> None:
        other = _make_user("other@me.com")
        event = _make_event(self.ws)
        RSVP.objects.create(
            event=event, user=other, status=RSVP.STATUS_YES
        )
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_soft_deleted_event_does_not_surface(self) -> None:
        # When the owner moves an event to the Trash, the participant
        # dashboard must hide it — the RSVP itself stays in the DB
        # (cascade is the owner's call later) but the event is
        # tombstoned via deleted_at, so the feed filters it out.
        event = _make_event(self.ws)
        RSVP.objects.create(
            event=event, user=self.me, status=RSVP.STATUS_YES
        )
        event.soft_delete(user=self.owner)
        self.assertEqual(self.client.get(self.url).json(), [])
