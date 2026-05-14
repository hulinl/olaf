from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


def _build_event(workspace, **overrides) -> Event:
    defaults = {
        "workspace": workspace,
        "slug": "letni-kemp-2026",
        "title": "Letní kemp 2026",
        "description": "Intenzivní víkend v Beskydech.",
        "starts_at": timezone.now() + timedelta(days=30),
        "ends_at": timezone.now() + timedelta(days=33),
        "tz": "Europe/Prague",
        "location_text": "Beskydy",
        "capacity": 2,
        "waitlist_enabled": True,
        "status": Event.STATUS_PUBLISHED,
        "visibility": Event.VISIBILITY_PUBLIC,
    }
    defaults.update(overrides)
    return Event.objects.create(**defaults)


def _valid_answers() -> dict:
    return {
        "tshirt_size": "M",
        "diet": "omnivore",
        "fitness_level": "intermediate",
        "fitness_note": "Run ~30 km / week.",
        "health_notes": "",
        "emergency_contact_name": "Eve Contact",
        "emergency_contact_phone": "+420 123 456 789",
        "photo_consent": True,
    }


class EventModelTests(TestCase):
    def setUp(self) -> None:
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)

    def test_slug_unique_within_workspace(self) -> None:
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            Event.objects.create(
                workspace=self.ws,
                slug="letni-kemp-2026",
                title="dup",
                starts_at=timezone.now(),
                ends_at=timezone.now() + timedelta(hours=1),
            )

    def test_ends_at_before_starts_at_rejected(self) -> None:
        from django.core.exceptions import ValidationError

        bad = Event(
            workspace=self.ws,
            slug="bad-event",
            title="Bad",
            starts_at=timezone.now() + timedelta(days=2),
            ends_at=timezone.now() + timedelta(days=1),
        )
        with self.assertRaises(ValidationError):
            bad.full_clean()

    def test_at_capacity_logic(self) -> None:
        u1 = User.objects.create_user(
            email="u1@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="One",
        )
        u2 = User.objects.create_user(
            email="u2@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="Two",
        )
        u3 = User.objects.create_user(
            email="u3@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="Three",
        )
        RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        self.assertTrue(self.event.is_at_capacity)
        third = RSVP.create_for_event(event=self.event, user=u3, questionnaire_answers={})
        self.assertEqual(third.status, RSVP.STATUS_WAITLIST)
        self.assertEqual(third.waitlist_position, 1)

    def test_waitlist_promotion_on_cancel(self) -> None:
        u1 = User.objects.create_user(email="u1@example.com", password="pass-abcdef-1234", first_name="A", last_name="One")
        u2 = User.objects.create_user(email="u2@example.com", password="pass-abcdef-1234", first_name="A", last_name="Two")
        u3 = User.objects.create_user(email="u3@example.com", password="pass-abcdef-1234", first_name="A", last_name="Three")
        r1 = RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        r3 = RSVP.create_for_event(event=self.event, user=u3, questionnaire_answers={})
        self.assertEqual(r3.status, RSVP.STATUS_WAITLIST)
        r1.cancel()
        r3.refresh_from_db()
        self.assertEqual(r3.status, RSVP.STATUS_YES)
        self.assertIsNone(r3.waitlist_position)

    def test_requires_approval_routes_to_pending(self) -> None:
        self.event.requires_approval = True
        self.event.save()
        u = User.objects.create_user(email="u@example.com", password="pass-abcdef-1234", first_name="A", last_name="X")
        r = RSVP.create_for_event(event=self.event, user=u, questionnaire_answers={})
        self.assertEqual(r.status, RSVP.STATUS_PENDING_APPROVAL)


class PublicEventEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.url = reverse(
            "events:public",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )

    def test_published_event_visible_to_anyone(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body["slug"], "letni-kemp-2026")
        self.assertEqual(body["workspace_slug"], "olafadventures")
        self.assertEqual(body["title"], "Letní kemp 2026")
        self.assertTrue(body["is_open_for_rsvp"])

    def test_draft_event_404_to_anonymous(self) -> None:
        self.event.status = Event.STATUS_DRAFT
        self.event.save()
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_draft_event_visible_to_owner(self) -> None:
        self.event.status = Event.STATUS_DRAFT
        self.event.save()
        owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.client.force_authenticate(owner)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class RSVPEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.url = reverse(
            "events:rsvp",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )

    def test_anonymous_rsvp_creates_light_user(self) -> None:
        resp = self.client.post(
            self.url,
            {
                "answers": _valid_answers(),
                "account": {
                    "email": "marta@example.com",
                    "first_name": "Marta",
                    "last_name": "Runner",
                    "phone": "+420 111",
                },
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        body = resp.json()
        self.assertEqual(body["status"], RSVP.STATUS_YES)
        self.assertTrue(User.objects.filter(email="marta@example.com").exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Letní kemp", mail.outbox[0].subject)

    def test_anonymous_rsvp_missing_account_rejected(self) -> None:
        resp = self.client.post(
            self.url, {"answers": _valid_answers()}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_authenticated_rsvp(self) -> None:
        user = User.objects.create_user(
            email="petr@example.com", password="pass-abcdef-1234",
            first_name="Petr", last_name="Runner", email_verified=True,
        )
        self.client.force_authenticate(user)
        resp = self.client.post(self.url, {"answers": _valid_answers()}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        rsvp = RSVP.objects.get(user=user, event=self.event)
        self.assertEqual(rsvp.status, RSVP.STATUS_YES)

    def test_rsvp_validates_questionnaire(self) -> None:
        user = User.objects.create_user(
            email="petr@example.com", password="pass-abcdef-1234",
            first_name="Petr", last_name="Runner", email_verified=True,
        )
        self.client.force_authenticate(user)
        bad = _valid_answers()
        bad["diet"] = "other"
        bad["diet_note"] = ""  # other without note
        resp = self.client.post(self.url, {"answers": bad}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rsvp_closed_event_400(self) -> None:
        self.event.status = Event.STATUS_CLOSED
        self.event.save()
        user = User.objects.create_user(
            email="petr@example.com", password="pass-abcdef-1234",
            first_name="Petr", last_name="Runner", email_verified=True,
        )
        self.client.force_authenticate(user)
        resp = self.client.post(self.url, {"answers": _valid_answers()}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_rsvp_promotes_waitlist(self) -> None:
        u1 = User.objects.create_user(email="u1@example.com", password="pass-abcdef-1234", first_name="A", last_name="One", email_verified=True)
        u2 = User.objects.create_user(email="u2@example.com", password="pass-abcdef-1234", first_name="A", last_name="Two", email_verified=True)
        u3 = User.objects.create_user(email="u3@example.com", password="pass-abcdef-1234", first_name="A", last_name="Three", email_verified=True)
        RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        r3 = RSVP.create_for_event(event=self.event, user=u3, questionnaire_answers={})
        self.assertEqual(r3.status, RSVP.STATUS_WAITLIST)

        cancel_url = reverse(
            "events:rsvp-cancel",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        self.client.force_authenticate(u1)
        resp = self.client.post(cancel_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        r3.refresh_from_db()
        self.assertEqual(r3.status, RSVP.STATUS_YES)


class OwnerEventListTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )

    def test_owner_sees_their_event(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.get(reverse("events:owner"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        slugs = [e["slug"] for e in resp.json()]
        self.assertIn("letni-kemp-2026", slugs)

    def test_owner_can_view_event_rsvps(self) -> None:
        participant = User.objects.create_user(
            email="p@example.com", password="pass-abcdef-1234",
            first_name="P", last_name="One", email_verified=True,
        )
        RSVP.create_for_event(
            event=self.event, user=participant, questionnaire_answers=_valid_answers()
        )
        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:rsvps",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["user_email"], "p@example.com")

    def test_non_owner_blocked_from_rsvp_list(self) -> None:
        outsider = User.objects.create_user(
            email="x@example.com", password="pass-abcdef-1234",
            first_name="X", last_name="Y", email_verified=True,
        )
        self.client.force_authenticate(outsider)
        url = reverse(
            "events:rsvps",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
