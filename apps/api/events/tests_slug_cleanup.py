"""Slugs cleanup + copy + draft rename regression tests.

Verifies:
- Duplicate endpoint doesn't emit `-kopie` in slug or `(kopie)` in title.
- Draft rename regenerates slug from new title (locks after publish).
- Slug alias captures old slug during rename for 308 redirects.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event, EventSlugAlias


class DuplicateEventSlugTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o@example.com",
            password="pass-abcdef-1234",
            first_name="Owner",
            last_name="One",
        )
        self.ws = Workspace.objects.create(slug="running-club", name="Running Club")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() + timedelta(days=7)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="run-01",
            title="Run 01",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_duplicate_slug_is_clean_no_kopie(self) -> None:
        r = self.client.post(
            reverse(
                "events:duplicate",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertNotIn("-kopie", body["slug"])
        self.assertNotIn("(kopie)", body["title"])
        # First dup → same base slug + `-2` dedup.
        self.assertEqual(body["slug"], "run-01-2")
        self.assertEqual(body["title"], "Run 01")

    def test_duplicate_twice_dedups(self) -> None:
        url = reverse(
            "events:duplicate",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        first = self.client.post(url).json()
        second = self.client.post(url).json()
        self.assertEqual(first["slug"], "run-01-2")
        self.assertEqual(second["slug"], "run-01-3")


class DraftSlugAutoRegenTests(TestCase):
    """Draft eventů se slug přegeneruje při přejmenování titulu.
    Publikovaný event si slug drží — přejmenování jen zapíše alias."""

    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o2@example.com",
            password="pass-abcdef-1234",
            first_name="Owner",
            last_name="Two",
        )
        self.ws = Workspace.objects.create(slug="hiking-club", name="Hiking Club")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def _make_event(self, *, status: str, slug: str, title: str) -> Event:
        starts = timezone.now() + timedelta(days=7)
        return Event.objects.create(
            workspace=self.ws,
            slug=slug,
            title=title,
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=status,
        )

    def _patch(self, event: Event, **payload) -> dict:
        r = self.client.patch(
            reverse(
                "events:update",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": event.slug,
                },
            ),
            data=payload,
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_draft_rename_regenerates_slug(self) -> None:
        event = self._make_event(
            status=Event.STATUS_DRAFT, slug="stary-nazev", title="Stary nazev"
        )
        body = self._patch(event, title="Zbrusu Novy Nazev")
        self.assertEqual(body["slug"], "zbrusu-novy-nazev")
        self.assertEqual(body["title"], "Zbrusu Novy Nazev")

    def test_draft_rename_creates_alias(self) -> None:
        event = self._make_event(
            status=Event.STATUS_DRAFT, slug="povodni", title="Povodni"
        )
        self._patch(event, title="Nova Trasa")
        self.assertTrue(
            EventSlugAlias.objects.filter(
                workspace=self.ws, old_slug="povodni"
            ).exists()
        )

    def test_published_rename_keeps_slug(self) -> None:
        event = self._make_event(
            status=Event.STATUS_PUBLISHED, slug="run-morning", title="Run Morning"
        )
        body = self._patch(event, title="Sunrise Run")
        # Slug se nemění — publikovaný event drží URL, jen se změní
        # title. Owner si může slug přepsat explicitně.
        self.assertEqual(body["slug"], "run-morning")

    def test_draft_rename_respects_explicit_slug(self) -> None:
        event = self._make_event(
            status=Event.STATUS_DRAFT, slug="cache-01", title="Cache 01"
        )
        body = self._patch(event, title="New Title", slug="my-choice")
        self.assertEqual(body["slug"], "my-choice")
