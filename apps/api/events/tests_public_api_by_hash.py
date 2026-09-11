"""GET /api/public/events/e/<public_id> — external integrations (Payload
admin na olafadventures.cz atd.). Stejný v3 payload jako `/…/{slug}`
verze, ale klíč = stabilní public_id."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event


class PublicEventByHashTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o@ex.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ne",
        )
        self.ws = Workspace.objects.create(slug="w1", name="W1")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() + timedelta(days=7)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="ev-1",
            title="Event",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )

    def _url(self, pid: str) -> str:
        return f"/api/public/events/e/{pid}"

    def test_returns_json_payload(self) -> None:
        r = self.client.get(self._url(self.event.public_id))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/json")
        body = r.json()
        self.assertEqual(body["slug"], "ev-1")
        self.assertEqual(body["title"], "Event")
        self.assertIn("state", body)
        self.assertIn("date", body)

    def test_cors_headers(self) -> None:
        r = self.client.get(self._url(self.event.public_id))
        self.assertEqual(r["Access-Control-Allow-Origin"], "*")
        self.assertIn("Cache-Control", r)

    def test_unknown_hash_404(self) -> None:
        r = self.client.get(self._url("zzzzzzzz"))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json(), {"error": "Event not found"})

    def test_archived_returns_410(self) -> None:
        self.event.deleted_at = timezone.now()
        self.event.save(update_fields=["deleted_at"])
        r = self.client.get(self._url(self.event.public_id))
        self.assertEqual(r.status_code, 410)
        self.assertEqual(r.json(), {"error": "Event archived"})

    def test_draft_returns_404(self) -> None:
        self.event.status = Event.STATUS_DRAFT
        self.event.save(update_fields=["status"])
        r = self.client.get(self._url(self.event.public_id))
        self.assertEqual(r.status_code, 404)
