"""toggle_rsvp_organizer + participant_profile endpoint coverage.

`toggle_rsvp_organizer` má klíčovou logiku waiving payment když
flip on, recompute když flip off. Bez testu je snadné, aby
refaktor pokazil tu state machine.

`participant_profile` zase má scope check — owner musí vidět jen
své účastníky, nikoho jiného.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_paid_event(ws: Workspace, slug: str = "ev") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title="E",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
        price_amount=Decimal("2500.00"),
        price_currency="CZK",
    )


class ToggleOrganizerTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@to.com")
        self.outsider = _make_user("x@to.com")
        self.participant = _make_user("p@to.com")
        self.ws = _make_workspace(self.owner, slug="tows")
        self.event = _make_paid_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("2500.00"),
            payment_currency="CZK",
            variable_symbol="11111",
        )
        self.client = APIClient()
        self.url = reverse(
            "events:rsvp-toggle-organizer",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "rsvp_id": self.rsvp.pk,
            },
        )

    def test_owner_marks_as_organizer_waives_payment(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"is_organizer": True}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.rsvp.refresh_from_db()
        self.assertTrue(self.rsvp.is_organizer)
        # Payment waived.
        self.assertEqual(self.rsvp.payment_status, "waived")
        self.assertIsNone(self.rsvp.payment_due_amount)
        self.assertIsNone(self.rsvp.paid_at)

    def test_unmark_organizer_recomputes_payment(self) -> None:
        # Setup: účastník byl organizátor (waived) → flip off.
        self.rsvp.is_organizer = True
        self.rsvp.payment_status = RSVP.PAYMENT_WAIVED
        self.rsvp.payment_due_amount = None
        self.rsvp.save()

        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"is_organizer": False}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.rsvp.refresh_from_db()
        self.assertFalse(self.rsvp.is_organizer)
        # Payment recomputed z event price.
        self.assertEqual(self.rsvp.payment_status, "pending")
        self.assertEqual(self.rsvp.payment_due_amount, Decimal("2500.00"))

    def test_unmark_already_paid_doesnt_reset(self) -> None:
        # Předtím organizer byl ale zaplaceno (rare ale realistic):
        # endpoint vidí PAYMENT_WAIVED jako podmínku pro recompute,
        # takže paid status zůstává.
        self.rsvp.is_organizer = True
        self.rsvp.payment_status = RSVP.PAYMENT_PAID
        self.rsvp.paid_at = timezone.now()
        self.rsvp.save()

        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"is_organizer": False}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.rsvp.refresh_from_db()
        # Paid status zůstává.
        self.assertEqual(self.rsvp.payment_status, "paid")

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self.url, {"is_organizer": True}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_unknown_rsvp_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            reverse(
                "events:rsvp-toggle-organizer",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                    "rsvp_id": 99999,
                },
            ),
            {"is_organizer": True},
            format="json",
        )
        self.assertEqual(r.status_code, 404)

    def test_anon_blocked(self) -> None:
        r = self.client.post(
            self.url, {"is_organizer": True}, format="json"
        )
        self.assertIn(r.status_code, (401, 403))


class ParticipantProfileTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@pp.com")
        self.outsider = _make_user("x@pp.com")
        self.participant = _make_user(
            "p@pp.com", first_name="Marta", last_name="Member"
        )
        self.ws = _make_workspace(self.owner, slug="ppws")
        self.event = _make_paid_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            questionnaire_answers={"diet": "vegetarian"},
        )
        self.client = APIClient()
        self.url = reverse(
            "events:rsvp-profile",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "rsvp_id": self.rsvp.pk,
            },
        )

    def test_owner_sees_participant_profile(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["email"], "p@pp.com")
        self.assertEqual(data["first_name"], "Marta")

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_unknown_rsvp_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            reverse(
                "events:rsvp-profile",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                    "rsvp_id": 99999,
                },
            )
        )
        self.assertEqual(r.status_code, 404)

    def test_cross_event_isolation(self) -> None:
        # RSVP patří jiné akci — endpoint pod tímto URL by ji ne
        # měl vidět.
        other_event = _make_paid_event(self.ws, slug="other-ev")
        other_user = _make_user("ou@pp.com")
        other_rsvp = RSVP.objects.create(
            event=other_event,
            user=other_user,
            status=RSVP.STATUS_YES,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            reverse(
                "events:rsvp-profile",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                    "rsvp_id": other_rsvp.pk,
                },
            )
        )
        # rsvp_id existuje, ale patří jinému eventu — endpoint ji
        # nevidí pod tímto URL.
        self.assertEqual(r.status_code, 404)
