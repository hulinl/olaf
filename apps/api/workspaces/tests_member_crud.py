"""Member promote/demote/handover + member detail endpoint.

Audit coverage v audit/tests.py už testuje že role-change vytvoří
audit row, ale samotné endpointy mají edge cases na ošetření:
- demote ownera (zakázáno — single-owner invariant)
- handover sebe sám sobě (logická pojistka)
- promote stranger (žádné connection s workspace)
- member_detail (profil + RSVP history) 403 vs 200 podle role

Tahle skupina drží kontrakt těch endpointů aby budoucí refaktor
nepropustil regresi.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event

from .models import Workspace, WorkspaceMember


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


class MemberPromoteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@p.com")
        self.member = _make_user("m@p.com")
        self.outsider = _make_user("x@p.com")
        self.ws = _make_workspace(self.owner, slug="pws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()

    def _url(self, user_id: int) -> str:
        return reverse(
            "workspaces:member-promote",
            kwargs={"slug": self.ws.slug, "user_id": user_id},
        )

    def test_owner_promotes_member_to_admin(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.member.pk))
        self.assertEqual(r.status_code, 200)
        membership = WorkspaceMember.objects.get(
            workspace=self.ws, user=self.member
        )
        self.assertEqual(membership.role, "admin")

    def test_non_super_admin_blocked(self) -> None:
        # Plain member nemůže promotovat — jen owner + admin.
        self.client.force_authenticate(self.member)
        r = self.client.post(self._url(self.member.pk))
        self.assertEqual(r.status_code, 403)

    def test_promoting_already_owner_400(self) -> None:
        # Owner promote sebe → odmítnuto („už má všechna práva").
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.owner.pk))
        self.assertEqual(r.status_code, 400)

    def test_promoting_stranger_400(self) -> None:
        # Outsider nemá žádný membership ani RSVP → odmítnuto.
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.outsider.pk))
        self.assertEqual(r.status_code, 400)

    def test_promoting_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(99999))
        self.assertEqual(r.status_code, 404)

    def test_promote_via_rsvp_only_lifts_to_admin(self) -> None:
        # RSVP-only user (žádné explicit členství) může být přímo
        # promotovaný — endpoint mu vytvoří membership row jako
        # vedlejší efekt.
        rsvp_user = _make_user("rsvp@p.com")
        # Akce ve workspace, RSVP od user
        starts = timezone.now() + timedelta(days=7)
        ev = Event.objects.create(
            workspace=self.ws,
            slug="ev",
            title="Ev",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
        )
        RSVP.objects.create(event=ev, user=rsvp_user, status=RSVP.STATUS_YES)

        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(rsvp_user.pk))
        self.assertEqual(r.status_code, 200)
        membership = WorkspaceMember.objects.get(
            workspace=self.ws, user=rsvp_user
        )
        self.assertEqual(membership.role, "admin")


class MemberDemoteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@d.com")
        self.admin_user = _make_user("a@d.com")
        self.ws = _make_workspace(self.owner, slug="dws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin_user,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        self.client = APIClient()

    def _url(self, user_id: int) -> str:
        return reverse(
            "workspaces:member-demote",
            kwargs={"slug": self.ws.slug, "user_id": user_id},
        )

    def test_owner_demotes_admin(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.admin_user.pk))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            WorkspaceMember.objects.get(
                workspace=self.ws, user=self.admin_user
            ).role,
            "member",
        )

    def test_cannot_demote_owner(self) -> None:
        # Single-owner invariant — demote owner → 400.
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.owner.pk))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(
            WorkspaceMember.objects.get(
                workspace=self.ws, user=self.owner
            ).role,
            "owner",
        )

    def test_demoting_unknown_member_404(self) -> None:
        # Member who isn't in this workspace.
        stranger = _make_user("s@d.com")
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(stranger.pk))
        self.assertEqual(r.status_code, 404)


class MemberHandoverTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@h.com")
        self.admin_user = _make_user("a@h.com")
        self.member = _make_user("m@h.com")
        self.ws = _make_workspace(self.owner, slug="hws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin_user,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()

    def _url(self, user_id: int) -> str:
        return reverse(
            "workspaces:member-handover",
            kwargs={"slug": self.ws.slug, "user_id": user_id},
        )

    def test_owner_hands_over_to_admin(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.admin_user.pk))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["new_owner_id"], self.admin_user.pk)
        self.assertEqual(data["old_owner_role"], "admin")
        # Roles flipped — original owner is now admin, target is owner.
        self.assertEqual(
            WorkspaceMember.objects.get(
                workspace=self.ws, user=self.owner
            ).role,
            "admin",
        )
        self.assertEqual(
            WorkspaceMember.objects.get(
                workspace=self.ws, user=self.admin_user
            ).role,
            "owner",
        )

    def test_cannot_handover_to_member(self) -> None:
        # Target musí být `admin` (ne `member`) — promote first.
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.member.pk))
        self.assertEqual(r.status_code, 400)

    def test_cannot_handover_to_self(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(self.owner.pk))
        self.assertEqual(r.status_code, 400)

    def test_non_owner_blocked(self) -> None:
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(self._url(self.admin_user.pk))
        self.assertEqual(r.status_code, 403)


class MemberDetailEndpointTests(TestCase):
    """`GET /api/workspaces/<ws>/members/<user_id>/` returns profile
    + RSVP history scoped to workspace events."""

    def setUp(self) -> None:
        self.owner = _make_user("o@det.com")
        self.member = _make_user("m@det.com")
        self.outsider = _make_user("x@det.com")
        self.ws = _make_workspace(self.owner, slug="detws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        starts = timezone.now() + timedelta(days=14)
        self.event_in_ws = Event.objects.create(
            workspace=self.ws,
            slug="ws-ev",
            title="WS event",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
        )
        # Event ve foreign workspace — NESMÍ leaknout do member_detail.
        foreign_owner = _make_user("o2@det.com")
        foreign_ws = _make_workspace(foreign_owner, slug="other")
        self.event_in_foreign = Event.objects.create(
            workspace=foreign_ws,
            slug="other-ev",
            title="Other event",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
        )
        # Member has RSVP v obou.
        RSVP.objects.create(
            event=self.event_in_ws, user=self.member, status=RSVP.STATUS_YES
        )
        RSVP.objects.create(
            event=self.event_in_foreign,
            user=self.member,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()

    def _url(self, user_id: int) -> str:
        return reverse(
            "workspaces:member-detail",
            kwargs={"slug": self.ws.slug, "user_id": user_id},
        )

    def test_owner_sees_member_detail(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(self.member.pk))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["email"], "m@det.com")
        # RSVPs scoped to workspace events — foreign event NESMÍ se objevit.
        event_slugs = [r["event_slug"] for r in data["rsvps"]]
        self.assertIn("ws-ev", event_slugs)
        self.assertNotIn("other-ev", event_slugs)

    def test_non_owner_blocked(self) -> None:
        self.client.force_authenticate(self.member)
        r = self.client.get(self._url(self.member.pk))
        self.assertEqual(r.status_code, 403)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._url(self.member.pk))
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self._url(self.member.pk))
        self.assertIn(r.status_code, (401, 403))

    def test_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(99999))
        self.assertEqual(r.status_code, 404)

    def test_unknown_workspace_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            reverse(
                "workspaces:member-detail",
                kwargs={"slug": "nope", "user_id": self.member.pk},
            )
        )
        self.assertEqual(r.status_code, 404)


class AdminPermissionBoundaryTests(TestCase):
    """Admin (non-owner) má operational přístup k workspacu (vidí
    členy, edituje obsah), ale role-change a handover jsou výhradně
    super-admin (`role=owner`) per `is_workspace_super_admin`. Pojistka
    proti regression na single-owner invariantu.
    """

    def setUp(self) -> None:
        self.owner = _make_user("o@adm.com")
        self.admin_user = _make_user("a@adm.com")
        self.member = _make_user("m@adm.com")
        self.ws = _make_workspace(self.owner, slug="admws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin_user,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()

    def test_admin_cannot_promote_member(self) -> None:
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(
            reverse(
                "workspaces:member-promote",
                kwargs={"slug": self.ws.slug, "user_id": self.member.pk},
            )
        )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(
            WorkspaceMember.objects.get(
                workspace=self.ws, user=self.member
            ).role,
            "member",
        )

    def test_admin_cannot_demote_other_admin(self) -> None:
        other_admin = _make_user("a2@adm.com")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=other_admin,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(
            reverse(
                "workspaces:member-demote",
                kwargs={"slug": self.ws.slug, "user_id": other_admin.pk},
            )
        )
        self.assertEqual(r.status_code, 403)

    def test_admin_cannot_handover_ownership(self) -> None:
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(
            reverse(
                "workspaces:member-handover",
                kwargs={"slug": self.ws.slug, "user_id": self.admin_user.pk},
            )
        )
        self.assertEqual(r.status_code, 403)

    def test_admin_can_view_member_detail(self) -> None:
        # member_detail používá `_is_owner` (operational), takže admin
        # MŮŽE vidět profily. Hranice operational vs super-admin
        # je deliberate — admin má všechen access kromě role-change.
        self.client.force_authenticate(self.admin_user)
        r = self.client.get(
            reverse(
                "workspaces:member-detail",
                kwargs={"slug": self.ws.slug, "user_id": self.member.pk},
            )
        )
        self.assertEqual(r.status_code, 200)
