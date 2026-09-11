"""Verifies `Event.public_id` generation, uniqueness, and the
`/api/events/e/<public_id>/` share endpoint (2026-09-11)."""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import PUBLIC_ID_ALPHABET, PUBLIC_ID_LEN, Event


class EventPublicIdTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="owner@ex.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ne",
        )
        self.ws = Workspace.objects.create(slug="pids", name="PIDs")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() + timedelta(days=7)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="ev-1",
            title="Event One",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )
        self.client = APIClient()

    def test_public_id_generated_on_create(self) -> None:
        self.assertEqual(len(self.event.public_id), PUBLIC_ID_LEN)
        for ch in self.event.public_id:
            self.assertIn(ch, PUBLIC_ID_ALPHABET)

    def test_public_id_unique_across_events(self) -> None:
        starts = timezone.now() + timedelta(days=10)
        other = Event.objects.create(
            workspace=self.ws,
            slug="ev-2",
            title="Event Two",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )
        self.assertNotEqual(self.event.public_id, other.public_id)

    def test_public_id_stable_across_saves(self) -> None:
        original = self.event.public_id
        self.event.title = "Renamed"
        self.event.save()
        self.event.refresh_from_db()
        self.assertEqual(self.event.public_id, original)

    def test_public_event_by_hash_endpoint_returns_full_payload(self) -> None:
        r = self.client.get(
            reverse(
                "events:public-by-hash",
                kwargs={"public_id": self.event.public_id},
            )
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["public_id"], self.event.public_id)
        self.assertEqual(body["slug"], "ev-1")
        self.assertEqual(body["title"], "Event One")

    def test_unknown_hash_is_404(self) -> None:
        r = self.client.get(
            reverse(
                "events:public-by-hash",
                kwargs={"public_id": "zzzzzzzz"},
            )
        )
        self.assertEqual(r.status_code, 404)

    def test_legacy_slug_endpoint_returns_public_id(self) -> None:
        r = self.client.get(
            reverse(
                "events:public",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["public_id"], self.event.public_id)
