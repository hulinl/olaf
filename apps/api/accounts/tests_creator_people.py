"""Creator-side people directory — `GET /api/auth/me/people/` +
`GET /api/auth/me/people/<user_id>/`.

Owner sees aggregated participant roster across všechny workspaces
kde je owner. Hot endpoint pro Lidé sekci cockpitu.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember

from .models import User


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


def _make_workspace_and_event(owner: User, slug: str = "ws") -> Event:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=f"{slug}-ev",
        title=f"Event {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


class CreatorPeopleListTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cp.com")
        self.event = _make_workspace_and_event(self.owner, slug="cpws")
        # Three RSVPed users.
        self.p1 = _make_user("p1@cp.com", first_name="Alice", last_name="A")
        self.p2 = _make_user("p2@cp.com", first_name="Bob", last_name="B")
        self.p3 = _make_user("p3@cp.com", first_name="Carol", last_name="C")
        RSVP.objects.create(event=self.event, user=self.p1, status=RSVP.STATUS_YES)
        RSVP.objects.create(event=self.event, user=self.p2, status=RSVP.STATUS_YES)
        RSVP.objects.create(
            event=self.event, user=self.p3, status=RSVP.STATUS_CANCELLED
        )
        self.client = APIClient()
        self.url = reverse("accounts:creator-people")

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_owner_sees_active_rsvpers(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        emails = [row["email"] for row in r.json()]
        # p1 + p2 yes — visible. p3 cancelled — hidden.
        self.assertIn("p1@cp.com", emails)
        self.assertIn("p2@cp.com", emails)
        self.assertNotIn("p3@cp.com", emails)

    def test_non_owner_returns_empty(self) -> None:
        non_owner = _make_user("x@cp.com")
        self.client.force_authenticate(non_owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_event_count_aggregated_across_workspace_events(self) -> None:
        # Vytvoříme druhou akci ve stejném workspace + p1 ji RSVP.
        starts = timezone.now() + timedelta(days=21)
        second_event = Event.objects.create(
            workspace=self.event.workspace,
            slug="cpws-ev2",
            title="Second",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(
            event=second_event, user=self.p1, status=RSVP.STATUS_YES
        )
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        rows_by_email = {row["email"]: row for row in r.json()}
        # p1 byl na 2 akcích, p2 na 1.
        self.assertEqual(rows_by_email["p1@cp.com"]["event_count"], 2)
        self.assertEqual(rows_by_email["p2@cp.com"]["event_count"], 1)

    def test_foreign_workspace_rsvps_dont_leak(self) -> None:
        # Druhý owner s vlastním workspace + RSVPed user.
        other_owner = _make_user("o2@cp.com")
        other_event = _make_workspace_and_event(other_owner, slug="otherws")
        foreign_user = _make_user("foreign@cp.com")
        RSVP.objects.create(
            event=other_event, user=foreign_user, status=RSVP.STATUS_YES
        )
        # Naš owner volá endpoint — foreign user NESMÍ být v listu.
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        emails = [row["email"] for row in r.json()]
        self.assertNotIn("foreign@cp.com", emails)


class CreatorPersonDetailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cpd.com")
        self.outsider = _make_user("x@cpd.com")
        self.event = _make_workspace_and_event(self.owner, slug="cpdws")
        self.participant = _make_user(
            "p@cpd.com", first_name="Petr", last_name="Skála"
        )
        RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()

    def _url(self, pk: int | None = None) -> str:
        return reverse(
            "accounts:creator-person-detail",
            kwargs={"user_id": pk or self.participant.pk},
        )

    def test_owner_sees_person_with_rsvp_history(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["email"], "p@cpd.com")
        self.assertEqual(data["first_name"], "Petr")
        # RSVP history obsahuje aspoň jednu položku z naších eventů.
        self.assertGreaterEqual(len(data.get("events", [])), 1)

    def test_outsider_404_no_shared_events(self) -> None:
        # Outsider nemá žádný workspace s tímto participant → 404
        # (žádné shared RSVPs, "nemet meets" person).
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 404)

    def test_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(pk=99999))
        self.assertEqual(r.status_code, 404)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self._url())
        self.assertIn(r.status_code, (401, 403))
