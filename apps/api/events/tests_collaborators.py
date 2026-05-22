"""Event collaborators (co-creators) endpoint coverage.

Owner přidá další pořadatele jako co-creator → ten může editovat
event, schvalovat RSVPs, ale není workspace member. Critical pro
multi-organizer akce.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event, EventCollaborator


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


def _make_event(ws: Workspace, slug: str = "ev") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title="E",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


class CollaboratorsListAddTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@col.com")
        self.candidate = _make_user("c@col.com")
        self.outsider = _make_user("x@col.com")
        self.ws = _make_workspace(self.owner, slug="colws")
        self.event = _make_event(self.ws)
        self.client = APIClient()
        self.url = reverse(
            "events:collaborators",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_owner_lists_empty(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_owner_adds_collaborator(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"email": "c@col.com"}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        # DB row exists.
        self.assertTrue(
            EventCollaborator.objects.filter(
                event=self.event, user=self.candidate
            ).exists()
        )
        # Response carries identity.
        self.assertEqual(r.json()["email"], "c@col.com")

    def test_email_match_case_insensitive(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"email": "C@COL.COM"}, format="json"
        )
        self.assertEqual(r.status_code, 201)

    def test_unknown_email_400_user_doesnt_exist(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"email": "ghost@col.com"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_cannot_add_self(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"email": self.owner.email}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_cannot_add_workspace_owner_as_collaborator(self) -> None:
        # Owner/admin už event spravuje přes workspace role —
        # endpoint vrátí 400.
        admin = _make_user("a@col.com")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=admin,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"email": "a@col.com"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_duplicate_add_returns_200_existing(self) -> None:
        # Druhý POST se stejným e-mailem — get_or_create vrátí 200
        # s existing row (žádný 4xx).
        self.client.force_authenticate(self.owner)
        self.client.post(self.url, {"email": "c@col.com"}, format="json")
        r = self.client.post(
            self.url, {"email": "c@col.com"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            EventCollaborator.objects.filter(event=self.event).count(),
            1,
        )

    def test_empty_email_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {"email": "  "}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self.url, {"email": "c@col.com"}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))


class CollaboratorDeleteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cd.com")
        self.collab_user = _make_user("c@cd.com")
        self.outsider = _make_user("x@cd.com")
        self.ws = _make_workspace(self.owner, slug="cdws")
        self.event = _make_event(self.ws)
        self.collab = EventCollaborator.objects.create(
            event=self.event,
            user=self.collab_user,
            added_by=self.owner,
        )
        self.client = APIClient()

    def _url(self, user_id: int | None = None) -> str:
        return reverse(
            "events:collaborator-detail",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "user_id": user_id or self.collab_user.pk,
            },
        )

    def test_owner_removes_collaborator(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(
            EventCollaborator.objects.filter(pk=self.collab.pk).exists()
        )

    def test_remove_unknown_user_still_204(self) -> None:
        # Endpoint je idempotent — žádný 404 když user není
        # collaborator (jen prázdný delete).
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url(user_id=99999))
        self.assertEqual(r.status_code, 204)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.delete(self._url())
        self.assertIn(r.status_code, (401, 403))


class CollaboratorPermissionEffectTests(TestCase):
    """Po add as collaborator, ten user může event editovat. Bez
    explicit role v workspace. Testuje že `can_manage_event` ho
    dovolí přes EventCollaborator path."""

    def setUp(self) -> None:
        self.owner = _make_user("o@cpe.com")
        self.collab_user = _make_user("c@cpe.com")
        self.outsider = _make_user("x@cpe.com")
        self.ws = _make_workspace(self.owner, slug="cpews")
        self.event = _make_event(self.ws)
        EventCollaborator.objects.create(
            event=self.event,
            user=self.collab_user,
            added_by=self.owner,
        )
        self.client = APIClient()

    def test_collaborator_can_update_event(self) -> None:
        self.client.force_authenticate(self.collab_user)
        r = self.client.patch(
            reverse(
                "events:update",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            ),
            {"title": "Updated by collaborator"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, "Updated by collaborator")

    def test_non_collaborator_outsider_blocked_from_update(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(
            reverse(
                "events:update",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            ),
            {"title": "Hack"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)
