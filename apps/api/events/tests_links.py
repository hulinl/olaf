"""EventLink CRUD + is_public gate.

Owner/co-creator vidí všechny linky (interní + veřejné), anon a
outsider jen `is_public=True`. Vytváření / update / delete jen
owner/co-creator.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event, EventLink


def _u(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="test-alpine-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _ws(owner: User, slug: str = "lws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _ev(ws: Workspace, slug: str = "expedition") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title="Expedice",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


class EventLinksTests(TestCase):
    def setUp(self) -> None:
        self.owner = _u("o@lk.com")
        self.outsider = _u("out@lk.com")
        self.ws = _ws(self.owner, slug="linkws")
        self.event = _ev(self.ws, slug="expedition")
        self.internal = EventLink.objects.create(
            event=self.event,
            title="Interní sheet",
            url="https://sheets.google.com/interni",
            is_public=False,
            sort_order=0,
        )
        self.public = EventLink.objects.create(
            event=self.event,
            title="Program",
            url="https://docs.google.com/program",
            is_public=True,
            sort_order=1,
        )
        self.client = APIClient()
        self.list_url = reverse(
            "events:event-links", args=[self.ws.slug, self.event.slug]
        )

    def test_owner_sees_both(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

    def test_anon_sees_only_public(self) -> None:
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, 200)
        titles = [r["title"] for r in resp.data]
        self.assertEqual(titles, ["Program"])

    def test_outsider_sees_only_public(self) -> None:
        self.client.force_authenticate(self.outsider)
        resp = self.client.get(self.list_url)
        self.assertEqual(len(resp.data), 1)

    def test_owner_creates_link(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            self.list_url,
            {"title": "Foto", "url": "https://photos.example/x", "is_public": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(EventLink.objects.filter(event=self.event).count(), 3)

    def test_outsider_cannot_create(self) -> None:
        self.client.force_authenticate(self.outsider)
        resp = self.client.post(
            self.list_url,
            {"title": "x", "url": "https://x.example/"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_owner_updates_and_deletes(self) -> None:
        detail_url = reverse(
            "events:event-link-detail",
            args=[self.ws.slug, self.event.slug, self.internal.pk],
        )
        self.client.force_authenticate(self.owner)
        # Toggle na public
        resp = self.client.patch(detail_url, {"is_public": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(EventLink.objects.get(pk=self.internal.pk).is_public)
        # Smaz
        resp = self.client.delete(detail_url)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(EventLink.objects.filter(pk=self.internal.pk).exists())

    def test_outsider_gets_404_on_detail(self) -> None:
        detail_url = reverse(
            "events:event-link-detail",
            args=[self.ws.slug, self.event.slug, self.internal.pk],
        )
        self.client.force_authenticate(self.outsider)
        resp = self.client.patch(detail_url, {"title": "hack"}, format="json")
        self.assertEqual(resp.status_code, 404)
