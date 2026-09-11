"""Landing page + RSVP submit chování pro proběhlé akce (2026-09-11).

User request: „proběhlé akce by měly být přístupné pro čtení (web
olafadventures.cz má sekci 'již realizováno'), ale nesmí se jít
zaregistrovat". Landing (`/api/events/<ws>/<slug>/`) vrací plný payload;
RSVP submit endpoint musí odmítnout past event i když status je stále
published (Celery `complete_finished_events` task běhá jen po 15 min).
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event


class PastEventTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o@ex.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ne",
        )
        self.ws = Workspace.objects.create(slug="ws", name="WS")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        # Started + skončila včera, ale status pořád published (Celery
        # task ho ještě nestihl přepnout).
        started = timezone.now() - timedelta(days=2)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="past",
            title="Past",
            starts_at=started,
            ends_at=started + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        self.client = APIClient()

    def test_landing_still_reachable(self) -> None:
        """Landing endpoint vrátí data i pro past event — externí web
        má na tom stavěnou sekci „již realizováno"."""
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
        body = r.json()
        self.assertEqual(body["slug"], "past")
        # is_open_for_rsvp respektuje ends_at, ne jen status.
        self.assertFalse(body["is_open_for_rsvp"])

    def test_rsvp_submit_rejected_for_past_event(self) -> None:
        r = self.client.post(
            reverse(
                "events:rsvp",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            ),
            data={
                "answers": {},
                "account": {
                    "email": "guest@ex.com",
                    "first_name": "G",
                    "last_name": "T",
                    "phone": "+420111222333",
                },
            },
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_public_api_still_serves_past_event(self) -> None:
        """Veřejné API pro externí web musí vracet past události —
        olafadventures.cz na tom drží sekci „již realizováno"."""
        r = self.client.get(
            f"/api/public/events/e/{self.event.public_id}"
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["state"], "ended")
        self.assertEqual(body["title"], "Past")

    def test_is_open_for_rsvp_property(self) -> None:
        """Property sama musí vracet False, když ends_at je v minulosti,
        i kdyby status byl published."""
        self.assertFalse(self.event.is_open_for_rsvp)
        # A když status není published, rozhodně false.
        self.event.status = Event.STATUS_COMPLETED
        self.assertFalse(self.event.is_open_for_rsvp)
