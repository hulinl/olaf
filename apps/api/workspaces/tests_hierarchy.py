"""Tests pro nested community hierarchy — Slice 2 vize „community awareness".

Data model: Workspace.parent_community FK + parent_link_status (pending/active).
Flow: child owner requestne parent → status=pending → parent admin approve →
status=active → propagace do race calendar effective membership.
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User

from .models import Workspace, WorkspaceMember


def _mk_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="pass-abcdef-1234",
        first_name=email.split("@")[0].capitalize(),
        last_name="X",
        email_verified=True,
    )


def _mk_ws(slug: str, name: str, owner: User) -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=name)
    WorkspaceMember.objects.create(
        workspace=ws,
        user=owner,
        role=WorkspaceMember.ROLE_OWNER,
        status=WorkspaceMember.STATUS_ACTIVE,
    )
    return ws


class WorkspaceHierarchyEndpointTests(TestCase):
    """POST /parent/ + approve/reject flow — full link lifecycle."""

    def setUp(self) -> None:
        self.client = APIClient()
        Workspace.objects.all().delete()
        self.olaf_admin = _mk_user("olaf@example.com")
        self.local_admin = _mk_user("local@example.com")
        self.parent = _mk_ws("olaf-adventures", "Olaf Adventures", self.olaf_admin)
        self.child = _mk_ws("beskydske", "Beskydské výběhy", self.local_admin)

    # --- GET ---

    def test_get_no_parent_returns_null(self) -> None:
        self.client.force_authenticate(self.local_admin)
        resp = self.client.get("/api/workspaces/beskydske/parent/")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["parent"])
        self.assertEqual(resp.json()["children"], [])

    def test_get_requires_admin(self) -> None:
        """Non-admin (nemá roli owner/admin) v komunitě nesmí vidět
        hierarchii ani ji upravovat."""
        stranger = _mk_user("stranger@example.com")
        self.client.force_authenticate(stranger)
        resp = self.client.get("/api/workspaces/beskydske/parent/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_requires_auth(self) -> None:
        resp = self.client.get("/api/workspaces/beskydske/parent/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- POST — link creation ---

    def test_post_creates_pending_when_not_parent_admin(self) -> None:
        """Local admin request Olaf parent — status pending (Olaf admin
        musí approve)."""
        self.client.force_authenticate(self.local_admin)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/",
            {"parent_slug": "olaf-adventures"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.child.refresh_from_db()
        self.assertEqual(self.child.parent_community, self.parent)
        self.assertEqual(
            self.child.parent_link_status, Workspace.PARENT_LINK_PENDING
        )
        self.assertEqual(self.child.parent_requested_by, self.local_admin)

    def test_post_activates_immediately_when_parent_admin(self) -> None:
        """Když je requester admin OBOU, status skočí rovnou na active."""
        # Přidat olaf_admin jako admina i do child komunity
        WorkspaceMember.objects.create(
            workspace=self.child,
            user=self.olaf_admin,
            role=WorkspaceMember.ROLE_ADMIN,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        self.client.force_authenticate(self.olaf_admin)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/",
            {"parent_slug": "olaf-adventures"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.child.refresh_from_db()
        self.assertEqual(
            self.child.parent_link_status, Workspace.PARENT_LINK_ACTIVE
        )

    def test_post_rejects_self_parent(self) -> None:
        self.client.force_authenticate(self.local_admin)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/",
            {"parent_slug": "beskydske"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_rejects_unknown_parent(self) -> None:
        self.client.force_authenticate(self.local_admin)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/",
            {"parent_slug": "neexistuje"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_post_rejects_cycle(self) -> None:
        """Když by proposed parent byl descendant child, blokuj (cycle)."""
        # Setup: parent = Olaf (child of Beskydské — cycle attempt)
        # Nejdřív attach Olaf → Beskydské jako parent
        self.parent.parent_community = self.child
        self.parent.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.parent.save()
        # Teď zkus Beskydské → Olaf (cycle: Beskydské → Olaf → Beskydské)
        self.client.force_authenticate(self.local_admin)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/",
            {"parent_slug": "olaf-adventures"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cyklus", resp.json()["detail"])

    def test_post_requires_admin_of_child(self) -> None:
        """Non-admin child komunity nesmí request parent."""
        stranger = _mk_user("stranger@example.com")
        self.client.force_authenticate(stranger)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/",
            {"parent_slug": "olaf-adventures"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_post_missing_parent_slug(self) -> None:
        self.client.force_authenticate(self.local_admin)
        resp = self.client.post(
            "/api/workspaces/beskydske/parent/", {}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- DELETE — unlink ---

    def test_delete_unlinks(self) -> None:
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.child.save()
        self.client.force_authenticate(self.local_admin)
        resp = self.client.delete("/api/workspaces/beskydske/parent/")
        self.assertEqual(resp.status_code, 200)
        self.child.refresh_from_db()
        self.assertIsNone(self.child.parent_community)
        self.assertEqual(self.child.parent_link_status, "")

    def test_delete_when_no_parent_400(self) -> None:
        self.client.force_authenticate(self.local_admin)
        resp = self.client.delete("/api/workspaces/beskydske/parent/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Parent-side approve/reject ---

    def test_parent_admin_approves_pending(self) -> None:
        """Local requestne parent → pending → Olaf admin approve → active."""
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_PENDING
        self.child.parent_requested_by = self.local_admin
        self.child.save()

        self.client.force_authenticate(self.olaf_admin)
        resp = self.client.post(
            "/api/workspaces/olaf-adventures/children/beskydske/approve/"
        )
        self.assertEqual(resp.status_code, 200)
        self.child.refresh_from_db()
        self.assertEqual(
            self.child.parent_link_status, Workspace.PARENT_LINK_ACTIVE
        )

    def test_parent_admin_rejects_pending(self) -> None:
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_PENDING
        self.child.save()

        self.client.force_authenticate(self.olaf_admin)
        resp = self.client.post(
            "/api/workspaces/olaf-adventures/children/beskydske/reject/"
        )
        self.assertEqual(resp.status_code, 200)
        self.child.refresh_from_db()
        self.assertIsNone(self.child.parent_community)
        self.assertEqual(self.child.parent_link_status, "")

    def test_approve_requires_admin_of_parent(self) -> None:
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_PENDING
        self.child.save()
        # Local admin (child owner) nesmí sám sebe approve na parent side
        self.client.force_authenticate(self.local_admin)
        resp = self.client.post(
            "/api/workspaces/olaf-adventures/children/beskydske/approve/"
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_approve_404_when_no_pending_request(self) -> None:
        self.client.force_authenticate(self.olaf_admin)
        resp = self.client.post(
            "/api/workspaces/olaf-adventures/children/beskydske/approve/"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_approve_400_when_already_active(self) -> None:
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.child.save()
        self.client.force_authenticate(self.olaf_admin)
        resp = self.client.post(
            "/api/workspaces/olaf-adventures/children/beskydske/approve/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_children_shown_in_parent_hierarchy(self) -> None:
        """GET parent's hierarchy vrátí seznam children."""
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.child.save()
        self.client.force_authenticate(self.olaf_admin)
        resp = self.client.get("/api/workspaces/olaf-adventures/parent/")
        data = resp.json()
        self.assertEqual(len(data["children"]), 1)
        self.assertEqual(data["children"][0]["slug"], "beskydske")
        self.assertEqual(
            data["children"][0]["link_status"], Workspace.PARENT_LINK_ACTIVE
        )


class WorkspaceEventPropagationTests(TestCase):
    """Slice 3 vize — parent workspace's events se propagují do child
    workspace listing. Olaf Adventures kemp se zobrazí i návštěvníkům
    lokální child komunity, aniž by musel být explicitně added do
    shared_workspaces každé akce.

    Non-active link (pending) event propagaci NEaktivuje.
    """

    def setUp(self) -> None:
        self.client = APIClient()
        Workspace.objects.all().delete()
        self.olaf_admin = _mk_user("olaf@example.com")
        self.local_admin = _mk_user("local@example.com")
        self.parent = _mk_ws("olaf-adventures", "Olaf Adventures", self.olaf_admin)
        self.child = _mk_ws("beskydske", "Beskydské výběhy", self.local_admin)

        # Vytvoř event v parent workspace
        from datetime import datetime, timedelta, timezone as dt_tz

        from events.models import Event

        self.event_parent = Event.objects.create(
            workspace=self.parent,
            slug="spring-camp",
            title="Spring Camp Beskydy",
            starts_at=datetime.now(dt_tz.utc) + timedelta(days=30),
            ends_at=datetime.now(dt_tz.utc) + timedelta(days=33),
            status=Event.STATUS_PUBLISHED,
        )

    def _activate_link(self) -> None:
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.child.save()

    def test_parent_event_visible_in_child_listing_when_active(self) -> None:
        """Návštěvník child workspace vidí parent's event."""
        self._activate_link()
        resp = self.client.get("/api/workspaces/beskydske/events/")
        titles = {e["title"] for e in resp.json()}
        self.assertIn("Spring Camp Beskydy", titles)

    def test_parent_event_hidden_when_link_pending(self) -> None:
        """Pending link nepropaguje events — child listing bez parent event."""
        self.child.parent_community = self.parent
        self.child.parent_link_status = Workspace.PARENT_LINK_PENDING
        self.child.save()
        resp = self.client.get("/api/workspaces/beskydske/events/")
        titles = {e["title"] for e in resp.json()}
        self.assertNotIn("Spring Camp Beskydy", titles)

    def test_parent_event_hidden_without_link(self) -> None:
        """Bez linku (žádný parent) — child listing prázdný."""
        resp = self.client.get("/api/workspaces/beskydske/events/")
        titles = {e["title"] for e in resp.json()}
        self.assertNotIn("Spring Camp Beskydy", titles)

    def test_child_events_dont_leak_upward(self) -> None:
        """Parent listing NEsmí vidět child's events (jednosměrná propagace).
        Umbrella se dolů dívá, ne nahoru."""
        from datetime import datetime, timedelta, timezone as dt_tz

        from events.models import Event

        Event.objects.create(
            workspace=self.child,
            slug="local-run",
            title="Beskydský půlmaraton",
            starts_at=datetime.now(dt_tz.utc) + timedelta(days=14),
            ends_at=datetime.now(dt_tz.utc) + timedelta(days=14),
            status=Event.STATUS_PUBLISHED,
        )
        self._activate_link()
        resp = self.client.get("/api/workspaces/olaf-adventures/events/")
        titles = {e["title"] for e in resp.json()}
        self.assertIn("Spring Camp Beskydy", titles)  # own
        self.assertNotIn("Beskydský půlmaraton", titles)  # child ne

    def test_draft_events_still_hidden_from_public(self) -> None:
        """Propagace nesmí obejít status filter — draft z parent zůstává
        hidden pro public návštěvníky child listu."""
        from events.models import Event

        self.event_parent.status = Event.STATUS_DRAFT
        self.event_parent.save()
        self._activate_link()
        resp = self.client.get("/api/workspaces/beskydske/events/")
        titles = {e["title"] for e in resp.json()}
        self.assertNotIn("Spring Camp Beskydy", titles)
