"""Slice 2 coverage — community admin permissions + promote/demote endpoint.

Locks in:
  - can_manage_community → workspace owner OR community admin
  - DELETE community is workspace-owner-only (defensive)
  - PATCH community OK for community admin
  - members list / invite OK for community admin
  - DELETE member: ws owner anyone; community admin only non-admins
  - promote/demote endpoint with all permission rules + last-admin guard
  - audit log row for each role change
  - serializer exposes `role` field
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from workspaces.models import Workspace, WorkspaceMember

from .models import Community, CommunityMember


def _user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="x-pwd-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _ws(slug: str, owner: User) -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _community(ws: Workspace, slug: str = "co") -> Community:
    return Community.objects.create(
        workspace=ws,
        slug=slug,
        name=slug.title(),
        visibility=Community.VISIBILITY_PRIVATE,
    )


def _member(community: Community, user: User, role="member") -> CommunityMember:
    return CommunityMember.objects.create(
        community=community,
        user=user,
        status=CommunityMember.STATUS_MEMBER,
        role=role,
    )


class CommunityAdminCanManageProfileTests(TestCase):
    """PATCH community detail — community admin teď smí."""

    def setUp(self) -> None:
        self.ws_owner = _user("ws@x.com")
        self.community_admin = _user("cadm@x.com")
        self.regular_member = _user("reg@x.com")
        self.outsider = _user("out@x.com")
        self.ws = _ws("permws", self.ws_owner)
        self.community = _community(self.ws, slug="profile-test")
        _member(self.community, self.community_admin, role="admin")
        _member(self.community, self.regular_member, role="member")
        self.url = f"/api/communities/workspaces/{self.ws.slug}/{self.community.slug}/"
        self.client = APIClient()

    def test_workspace_owner_can_patch(self) -> None:
        self.client.force_authenticate(self.ws_owner)
        r = self.client.patch(self.url, {"name": "X"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_community_admin_can_patch(self) -> None:
        self.client.force_authenticate(self.community_admin)
        r = self.client.patch(self.url, {"name": "By admin"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.community.refresh_from_db()
        self.assertEqual(self.community.name, "By admin")

    def test_regular_member_cannot_patch(self) -> None:
        self.client.force_authenticate(self.regular_member)
        r = self.client.patch(self.url, {"name": "Hack"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_outsider_cannot_patch(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(self.url, {"name": "Hack"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_only_workspace_owner_can_delete(self) -> None:
        # Defensive: community admin smí editovat, ne mazat celou komunitu.
        self.client.force_authenticate(self.community_admin)
        r = self.client.delete(self.url)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.ws_owner)
        r = self.client.delete(self.url)
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)


class CommunityAdminCanInviteMembersTests(TestCase):
    def setUp(self) -> None:
        self.ws_owner = _user("ws2@x.com")
        self.community_admin = _user("cadm2@x.com")
        self.regular = _user("reg2@x.com")
        self.invitee = _user("inv@x.com")
        self.ws = _ws("permws2", self.ws_owner)
        self.community = _community(self.ws, slug="invite-test")
        _member(self.community, self.community_admin, role="admin")
        _member(self.community, self.regular, role="member")
        self.url = (
            f"/api/communities/workspaces/{self.ws.slug}/"
            f"{self.community.slug}/members/"
        )
        self.client = APIClient()

    def test_community_admin_can_invite(self) -> None:
        self.client.force_authenticate(self.community_admin)
        r = self.client.post(
            self.url, {"emails": "inv@x.com"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r.json()["added"]), 1)

    def test_regular_member_cannot_invite(self) -> None:
        self.client.force_authenticate(self.regular)
        r = self.client.post(
            self.url, {"emails": "inv@x.com"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_community_admin_sees_member_list(self) -> None:
        self.client.force_authenticate(self.community_admin)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # Role field je v response (frontend ho vidí).
        roles = {m["role"] for m in r.json()}
        self.assertEqual(roles, {"admin", "member"})


class CommunityMemberRemovalTests(TestCase):
    """Community admin smí remove non-adminy; admins jen ws owner."""

    def setUp(self) -> None:
        self.ws_owner = _user("ws3@x.com")
        self.admin_a = _user("a@x.com")
        self.admin_b = _user("b@x.com")
        self.regular = _user("r@x.com")
        self.ws = _ws("rm", self.ws_owner)
        self.community = _community(self.ws, slug="rm-test")
        self.a_member = _member(self.community, self.admin_a, role="admin")
        self.b_member = _member(self.community, self.admin_b, role="admin")
        self.r_member = _member(self.community, self.regular, role="member")
        self.client = APIClient()

    def _url(self, m_id: int) -> str:
        return (
            f"/api/communities/workspaces/{self.ws.slug}/"
            f"{self.community.slug}/members/{m_id}/"
        )

    def test_community_admin_removes_regular(self) -> None:
        self.client.force_authenticate(self.admin_a)
        r = self.client.delete(self._url(self.r_member.pk))
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

    def test_community_admin_cannot_remove_another_admin(self) -> None:
        # admin_a se pokusí remove admin_b → 403 (demote first).
        self.client.force_authenticate(self.admin_a)
        r = self.client.delete(self._url(self.b_member.pk))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_workspace_owner_removes_admin(self) -> None:
        self.client.force_authenticate(self.ws_owner)
        r = self.client.delete(self._url(self.a_member.pk))
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

    def test_regular_member_cannot_remove(self) -> None:
        self.client.force_authenticate(self.regular)
        r = self.client.delete(self._url(self.a_member.pk))
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)


class RoleChangeEndpointTests(TestCase):
    def setUp(self) -> None:
        self.ws_owner = _user("ws4@x.com")
        self.admin_a = _user("aa@x.com")
        self.admin_b = _user("bb@x.com")
        self.regular = _user("rr@x.com")
        self.outsider = _user("oo@x.com")
        self.ws = _ws("rc", self.ws_owner)
        self.community = _community(self.ws, slug="rc-test")
        self.a_mem = _member(self.community, self.admin_a, role="admin")
        self.b_mem = _member(self.community, self.admin_b, role="admin")
        self.r_mem = _member(self.community, self.regular, role="member")
        self.client = APIClient()

    def _url(self, m_id: int) -> str:
        return (
            f"/api/communities/workspaces/{self.ws.slug}/"
            f"{self.community.slug}/members/{m_id}/role/"
        )

    def test_promote_member_to_admin(self) -> None:
        self.client.force_authenticate(self.admin_a)
        r = self.client.post(
            self._url(self.r_mem.pk), {"role": "admin"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.r_mem.refresh_from_db()
        self.assertEqual(self.r_mem.role, "admin")

    def test_demote_admin_to_member(self) -> None:
        # admin_a demote admin_b — pořád zbývá admin_a + jeho self => ok.
        self.client.force_authenticate(self.admin_a)
        r = self.client.post(
            self._url(self.b_mem.pk), {"role": "member"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.b_mem.refresh_from_db()
        self.assertEqual(self.b_mem.role, "member")

    def test_self_demote_last_admin_blocked(self) -> None:
        # Setup: nech jenom 1 admina (demote b nejdřív).
        self.b_mem.role = "member"
        self.b_mem.save(update_fields=["role"])

        # admin_a (poslední admin) si chce demote sám sebe → 403.
        self.client.force_authenticate(self.admin_a)
        r = self.client.post(
            self._url(self.a_mem.pk), {"role": "member"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        # Czech reason je v detail.
        self.assertIn("alespoň jednoho admina", r.json()["detail"])

    def test_workspace_owner_can_demote_last_admin(self) -> None:
        # Tenancy override — ws owner smí všechno.
        self.b_mem.role = "member"
        self.b_mem.save(update_fields=["role"])

        self.client.force_authenticate(self.ws_owner)
        r = self.client.post(
            self._url(self.a_mem.pk), {"role": "member"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_regular_member_cannot_change_role(self) -> None:
        self.client.force_authenticate(self.regular)
        r = self.client.post(
            self._url(self.b_mem.pk), {"role": "member"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_outsider_cannot_change_role(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self._url(self.b_mem.pk), {"role": "member"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_role_400(self) -> None:
        self.client.force_authenticate(self.ws_owner)
        r = self.client.post(
            self._url(self.r_mem.pk), {"role": "super"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_idempotent_no_change(self) -> None:
        # Already admin → set admin → no audit row, 200.
        before = AuditLog.objects.filter(
            action=AuditLog.ACTION_COMMUNITY_MEMBER_ROLE_CHANGE
        ).count()
        self.client.force_authenticate(self.admin_a)
        r = self.client.post(
            self._url(self.b_mem.pk), {"role": "admin"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        after = AuditLog.objects.filter(
            action=AuditLog.ACTION_COMMUNITY_MEMBER_ROLE_CHANGE
        ).count()
        self.assertEqual(before, after)

    def test_writes_audit_log_on_change(self) -> None:
        self.client.force_authenticate(self.admin_a)
        r = self.client.post(
            self._url(self.r_mem.pk), {"role": "admin"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        row = AuditLog.objects.get(
            action=AuditLog.ACTION_COMMUNITY_MEMBER_ROLE_CHANGE
        )
        self.assertEqual(row.actor, self.admin_a)
        self.assertEqual(row.workspace, self.ws)
        self.assertEqual(row.target_id, str(self.r_mem.pk))
        self.assertEqual(row.payload["old_role"], "member")
        self.assertEqual(row.payload["new_role"], "admin")
        self.assertEqual(row.payload["community_slug"], "rc-test")

    def test_pending_member_role_change_400(self) -> None:
        # Můžou se měnit jen aktivní memberships.
        pending_user = _user("p@x.com")
        pending = CommunityMember.objects.create(
            community=self.community,
            user=pending_user,
            status=CommunityMember.STATUS_PENDING,
            role="member",
        )
        self.client.force_authenticate(self.ws_owner)
        r = self.client.post(
            self._url(pending.pk), {"role": "admin"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("aktivním", r.json()["detail"])
