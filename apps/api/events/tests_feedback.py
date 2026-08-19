"""Post-event feedback flow — magic-link + owner surface + fan-out.

Coverage:
- GET feedback endpoint vrátí event context + existing (null když ještě
  nic není).
- POST vytvoří EventFeedback svázaný s RSVP + snapshot email/name.
- Druhý POST je upsert (update, ne duplicate row).
- 404 na malformed / neznámý token (žádný info-leak).
- Fan-out endpoint pošle jen YES non-organizer RSVP, ne cancelled,
  waitlist, ani organizátorům.
- Admin gate: non-owner (member, cizí user) → 404.
"""
from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event, EventFeedback


def _make_user(email: str, first="Jana", last="Nováková") -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name=first,
        last_name=last,
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str = "fbws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, slug: str = "letni-kemp") -> Event:
    starts = timezone.now() - timedelta(days=1)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title="Letní kemp",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


def _make_rsvp(
    event: Event,
    user: User,
    *,
    status: str = RSVP.STATUS_YES,
    is_organizer: bool = False,
) -> RSVP:
    return RSVP.objects.create(
        event=event,
        user=user,
        status=status,
        is_organizer=is_organizer,
    )


class FeedbackByTokenTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@fb.com", first="Olaf")
        self.participant = _make_user("p@fb.com", first="Jana")
        self.ws = _make_workspace(self.owner)
        self.event = _make_event(self.ws)
        self.rsvp = _make_rsvp(self.event, self.participant)
        self.client = APIClient()
        self.url = reverse(
            "events:feedback-by-token", args=[str(self.rsvp.feedback_token)]
        )

    def test_get_returns_context_with_no_existing_feedback(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["event_title"], "Letní kemp")
        self.assertIn("event_starts_at", resp.data)
        self.assertIn("event_ends_at", resp.data)
        self.assertIn("event_location", resp.data)
        self.assertIsNone(resp.data["existing"])

    def test_post_creates_feedback_with_snapshot(self) -> None:
        resp = self.client.post(
            self.url,
            {
                "rating": 5,
                "went_well": "Skvělé jídlo",
                "could_improve": "Chladnější spacák",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        fb = EventFeedback.objects.get(rsvp=self.rsvp)
        self.assertEqual(fb.rating, 5)
        self.assertEqual(fb.email, "p@fb.com")
        self.assertIn("Jana", fb.name)
        self.assertEqual(fb.went_well, "Skvělé jídlo")

    def test_second_post_is_upsert_not_duplicate(self) -> None:
        self.client.post(
            self.url, {"rating": 3, "went_well": "OK"}, format="json"
        )
        self.client.post(
            self.url,
            {"rating": 5, "went_well": "Nakonec super", "could_improve": ""},
            format="json",
        )
        self.assertEqual(EventFeedback.objects.filter(rsvp=self.rsvp).count(), 1)
        fb = EventFeedback.objects.get(rsvp=self.rsvp)
        self.assertEqual(fb.rating, 5)
        self.assertEqual(fb.went_well, "Nakonec super")

    def test_get_returns_existing_when_already_submitted(self) -> None:
        self.client.post(self.url, {"rating": 4}, format="json")
        resp = self.client.get(self.url)
        self.assertEqual(resp.data["existing"]["rating"], 4)

    def test_bad_token_returns_404(self) -> None:
        resp = self.client.get(
            reverse("events:feedback-by-token", args=["not-a-uuid"])
        )
        self.assertEqual(resp.status_code, 404)

    def test_rating_out_of_range_rejected(self) -> None:
        resp = self.client.post(self.url, {"rating": 6}, format="json")
        self.assertEqual(resp.status_code, 400)


class FeedbackFanOutTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@fo.com", first="Olaf")
        self.confirmed = _make_user("c@fo.com")
        self.organizer = _make_user("org@fo.com", first="Tomáš")
        self.waitlisted = _make_user("w@fo.com", first="Petr")
        self.cancelled = _make_user("x@fo.com", first="Eva")
        self.outsider = _make_user("out@fo.com", first="Cizí")

        self.ws = _make_workspace(self.owner, slug="foutws")
        self.event = _make_event(self.ws)

        _make_rsvp(self.event, self.confirmed, status=RSVP.STATUS_YES)
        _make_rsvp(self.event, self.organizer, is_organizer=True)
        _make_rsvp(self.event, self.waitlisted, status=RSVP.STATUS_WAITLIST)
        _make_rsvp(self.event, self.cancelled, status=RSVP.STATUS_CANCELLED)

        self.client = APIClient()
        self.url = reverse(
            "events:event-feedback", args=[self.ws.slug, self.event.slug]
        )

    def test_owner_fan_out_only_hits_yes_non_organizer(self) -> None:
        self.client.force_authenticate(self.owner)
        mail.outbox.clear()
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["sent"], 1)
        # jen confirmed dostal mail
        recipients = [addr for m in mail.outbox for addr in m.to]
        self.assertEqual(recipients, ["c@fo.com"])

    def test_non_owner_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, 404)

    def test_anon_blocked(self) -> None:
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, 401)

    def test_owner_list_returns_submitted_feedback(self) -> None:
        rsvp = RSVP.objects.get(user=self.confirmed)
        EventFeedback.objects.create(
            rsvp=rsvp,
            event=self.event,
            email=rsvp.user.email,
            name=rsvp.user.get_full_name(),
            rating=5,
            went_well="Vše super",
        )
        self.client.force_authenticate(self.owner)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["rating"], 5)
        self.assertEqual(resp.data[0]["email"], "c@fo.com")
