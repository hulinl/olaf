"""Workspace lifecycle endpoint coverage — create, personal, events,
members listing.

Tahle skupina endpointů je hit prakticky pokaždé, když user otevře
aplikaci (member dropdown, dashboard, owner cockpit). Bug tady se
projeví okamžitě — empty workspace list, missing events, atd.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event

from .models import Workspace, WorkspaceMember


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


def _make_workspace(owner: User, slug: str = "ws", **extra) -> Workspace:
    extra.setdefault("name", slug.title())
    ws = Workspace.objects.create(slug=slug, **extra)
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


class CreateWorkspaceTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@cw.com")
        self.client = APIClient()
        self.url = reverse("workspaces:create")

    def test_anon_blocked(self) -> None:
        r = self.client.post(
            self.url, {"slug": "new", "name": "New"}, format="json"
        )
        self.assertIn(r.status_code, (401, 403))

    def test_authed_creates_workspace_and_owner_membership(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.post(
            self.url, {"slug": "new", "name": "New Party"}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.json())
        ws = Workspace.objects.get(slug="new")
        self.assertEqual(ws.name, "New Party")
        membership = WorkspaceMember.objects.get(workspace=ws, user=self.user)
        self.assertEqual(membership.role, "owner")
        # Response payload obsahuje my_role + member_count.
        self.assertEqual(r.json()["my_role"], "owner")
        self.assertEqual(r.json()["member_count"], 1)

    def test_creates_with_atomic_membership(self) -> None:
        # Pokud Workspace.create selže, atomic blok rollbackne i
        # membership. Tady test pasivní — že happy path skutečně
        # vytvoří OBA records.
        self.client.force_authenticate(self.user)
        self.client.post(
            self.url, {"slug": "atomic", "name": "Atomic"}, format="json"
        )
        ws = Workspace.objects.get(slug="atomic")
        self.assertTrue(
            WorkspaceMember.objects.filter(workspace=ws).exists()
        )

    def test_duplicate_slug_400(self) -> None:
        Workspace.objects.create(slug="taken", name="Taken")
        self.client.force_authenticate(self.user)
        r = self.client.post(
            self.url, {"slug": "taken", "name": "Other"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_reserved_slug_400(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.post(
            self.url, {"slug": "dashboard", "name": "X"}, format="json"
        )
        self.assertEqual(r.status_code, 400)


class MyPersonalWorkspaceTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("p@pw.com", first_name="Olaf", last_name="Hulin")
        self.client = APIClient()
        self.url = reverse("workspaces:personal")

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_lazy_creates_personal_workspace(self) -> None:
        self.assertFalse(
            Workspace.objects.filter(
                slug=f"personal-{self.user.pk}"
            ).exists()
        )
        self.client.force_authenticate(self.user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        ws = Workspace.objects.get(slug=f"personal-{self.user.pk}")
        self.assertTrue(ws.is_personal)
        self.assertEqual(ws.default_tz, "Europe/Prague")
        # User je owner.
        membership = WorkspaceMember.objects.get(workspace=ws, user=self.user)
        self.assertEqual(membership.role, "owner")

    def test_idempotent_on_repeat(self) -> None:
        self.client.force_authenticate(self.user)
        self.client.get(self.url)
        self.client.get(self.url)
        self.assertEqual(
            Workspace.objects.filter(
                slug=f"personal-{self.user.pk}"
            ).count(),
            1,
        )

    def test_personal_workspace_not_in_my_workspaces_list(self) -> None:
        # Personal workspaces jsou plumbing, ne destination — chybí
        # v /api/workspaces/mine/.
        self.client.force_authenticate(self.user)
        self.client.get(self.url)  # creates personal
        r = self.client.get(reverse("workspaces:mine"))
        self.assertEqual(r.status_code, 200)
        slugs = [w["slug"] for w in r.json()]
        self.assertNotIn(f"personal-{self.user.pk}", slugs)


class WorkspaceEventsListTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@we.com")
        self.outsider = _make_user("x@we.com")
        self.ws = _make_workspace(self.owner, slug="wews")
        self.client = APIClient()
        self.url = reverse(
            "workspaces:events", kwargs={"slug": self.ws.slug}
        )

    def _make_event(self, **overrides) -> Event:
        starts = overrides.pop(
            "starts_at", timezone.now() + timedelta(days=14)
        )
        defaults = {
            "slug": "ev",
            "title": "E",
            "starts_at": starts,
            "ends_at": starts + timedelta(hours=4),
            "status": Event.STATUS_PUBLISHED,
        }
        defaults.update(overrides)
        return Event.objects.create(workspace=self.ws, **defaults)

    def test_anon_can_list_published_events(self) -> None:
        self._make_event(slug="public", status=Event.STATUS_PUBLISHED)
        self._make_event(slug="draft", status=Event.STATUS_DRAFT)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        slugs = [e["slug"] for e in r.json()]
        self.assertIn("public", slugs)
        self.assertNotIn("draft", slugs)

    def test_owner_sees_drafts(self) -> None:
        self._make_event(slug="public", status=Event.STATUS_PUBLISHED)
        self._make_event(slug="draft", status=Event.STATUS_DRAFT)
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        slugs = [e["slug"] for e in r.json()]
        self.assertIn("draft", slugs)

    def test_soft_deleted_events_excluded(self) -> None:
        event = self._make_event(slug="visible")
        deleted = self._make_event(slug="trash")
        deleted.soft_delete(user=self.owner)
        # I owner nevidí soft-deleted v events listingu (jen ve trash).
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        slugs = [e["slug"] for e in r.json()]
        self.assertIn("visible", slugs)
        self.assertNotIn("trash", slugs)

    def test_unknown_workspace_404(self) -> None:
        r = self.client.get(
            reverse("workspaces:events", kwargs={"slug": "neexistuje"})
        )
        self.assertEqual(r.status_code, 404)


class WorkspaceMembersListTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@wm.com", first_name="Olaf", last_name="O")
        self.admin = _make_user("a@wm.com", first_name="Admin", last_name="A")
        self.member = _make_user("m@wm.com", first_name="Member", last_name="M")
        self.outsider = _make_user("x@wm.com")
        self.ws = _make_workspace(self.owner, slug="wmws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()
        self.url = reverse(
            "workspaces:members", kwargs={"slug": self.ws.slug}
        )

    def test_owner_sees_full_list(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        emails = [m["email"] for m in r.json()]
        self.assertEqual(set(emails), {"o@wm.com", "a@wm.com", "m@wm.com"})

    def test_admin_sees_full_list(self) -> None:
        self.client.force_authenticate(self.admin)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 3)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))


class WorkspaceMembersCsvTests(TestCase):
    """CSV export endpoint — owner-only download for newsletter or
    accounting."""

    def setUp(self) -> None:
        self.owner = _make_user("o@csv.com", first_name="O", last_name="One")
        self.member = _make_user("m@csv.com", first_name="Marta", last_name="Member")
        self.outsider = _make_user("x@csv.com")
        self.ws = _make_workspace(self.owner, slug="csvws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()
        self.url = reverse(
            "workspaces:members-csv", kwargs={"slug": self.ws.slug}
        )

    def test_owner_downloads_csv(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        # Content-Type CSV.
        self.assertIn("text/csv", r["Content-Type"])
        body = r.content.decode("utf-8-sig")  # strip BOM
        # Member's e-mail present in payload.
        self.assertIn("m@csv.com", body)
        self.assertIn("Marta", body)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))
