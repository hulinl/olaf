"""Tests for public join + approval flow (2026-09-21).

Cover:
- Anon can GET public community detail; private returns 404 to anon.
- Auth non-member can POST /join/ on public → creates pending row.
- Join idempotence — repeat POST returns already_member/already_pending.
- Private community rejects self-join (403).
- Owner/community admin can approve → status=member + audit + notif.
- Owner/community admin can reject → status=declined + audit + notif.
- Non-admin cannot approve/reject.
- my_membership field reflects requester state.
"""
from __future__ import annotations

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from notifications.models import Notification
from workspaces.models import Workspace, WorkspaceMember

from .models import Community, CommunityMember


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="A",
        last_name="B",
        email_verified=True,
    )


def _make_workspace(slug: str, owner: User) -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


class CommunityPublicDetailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@join.cm")
        self.ws = _make_workspace("acme", self.owner)
        self.public = Community.objects.create(
            workspace=self.ws,
            slug="hikers",
            name="Hikers",
            visibility=Community.VISIBILITY_PUBLIC,
        )
        self.private = Community.objects.create(
            workspace=self.ws,
            slug="board",
            name="Board",
            visibility=Community.VISIBILITY_PRIVATE,
        )
        self.client = APIClient()

    def _url(self, community: Community) -> str:
        return (
            f"/api/communities/workspaces/{self.ws.slug}/{community.slug}/"
        )

    def test_anon_can_read_public(self) -> None:
        resp = self.client.get(self._url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["slug"], "hikers")
        self.assertIsNone(resp.data["my_membership"])

    def test_anon_gets_404_on_private(self) -> None:
        resp = self.client.get(self._url(self.private))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_auth_non_member_gets_404_on_private(self) -> None:
        joe = _make_user("joe@x.cm")
        self.client.force_authenticate(user=joe)
        resp = self.client.get(self._url(self.private))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_sees_private(self) -> None:
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(self._url(self.private))
        self.assertEqual(resp.status_code, 200)

    def test_my_membership_reflects_state(self) -> None:
        joe = _make_user("joe2@x.cm")
        CommunityMember.objects.create(
            community=self.public,
            user=joe,
            status=CommunityMember.STATUS_PENDING,
        )
        self.client.force_authenticate(user=joe)
        resp = self.client.get(self._url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["my_membership"]["status"], "pending")


class CommunityJoinTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@join.cm")
        self.joe = _make_user("joe@join.cm")
        self.ws = _make_workspace("acme", self.owner)
        self.public = Community.objects.create(
            workspace=self.ws,
            slug="hikers",
            name="Hikers",
            visibility=Community.VISIBILITY_PUBLIC,
        )
        self.private = Community.objects.create(
            workspace=self.ws,
            slug="board",
            name="Board",
            visibility=Community.VISIBILITY_PRIVATE,
        )
        self.unlisted = Community.objects.create(
            workspace=self.ws,
            slug="beta",
            name="Beta",
            visibility=Community.VISIBILITY_UNLISTED,
        )
        self.client = APIClient()

    def _join_url(self, c: Community) -> str:
        return f"/api/communities/workspaces/{self.ws.slug}/{c.slug}/join/"

    def test_anon_cannot_join(self) -> None:
        resp = self.client.post(self._join_url(self.public))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_auth_user_can_join_public(self) -> None:
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._join_url(self.public))
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")
        row = CommunityMember.objects.get(community=self.public, user=self.joe)
        self.assertEqual(row.status, CommunityMember.STATUS_PENDING)
        # Owner dostal bell notifikaci.
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.owner,
                kind=Notification.KIND_COMMUNITY_JOIN_REQUEST,
            ).exists()
        )

    def test_join_is_idempotent_pending(self) -> None:
        self.client.force_authenticate(user=self.joe)
        self.client.post(self._join_url(self.public))
        resp = self.client.post(self._join_url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "already_pending")
        self.assertEqual(
            CommunityMember.objects.filter(
                community=self.public, user=self.joe
            ).count(),
            1,
        )

    def test_join_is_idempotent_member(self) -> None:
        CommunityMember.objects.create(
            community=self.public,
            user=self.joe,
            status=CommunityMember.STATUS_MEMBER,
            decided_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._join_url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "already_member")

    def test_re_request_after_decline(self) -> None:
        CommunityMember.objects.create(
            community=self.public,
            user=self.joe,
            status=CommunityMember.STATUS_DECLINED,
            decided_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._join_url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "pending")
        row = CommunityMember.objects.get(community=self.public, user=self.joe)
        self.assertEqual(row.status, CommunityMember.STATUS_PENDING)
        self.assertIsNone(row.decided_at)

    def test_private_rejects_self_join(self) -> None:
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._join_url(self.private))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unlisted_rejects_self_join(self) -> None:
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._join_url(self.unlisted))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class CommunityApproveRejectTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@ar.cm")
        self.joe = _make_user("joe@ar.cm")
        self.outsider = _make_user("outsider@ar.cm")
        self.ws = _make_workspace("acme", self.owner)
        self.community = Community.objects.create(
            workspace=self.ws,
            slug="hikers",
            name="Hikers",
            visibility=Community.VISIBILITY_PUBLIC,
        )
        self.pending = CommunityMember.objects.create(
            community=self.community,
            user=self.joe,
            status=CommunityMember.STATUS_PENDING,
        )
        self.client = APIClient()

    def _approve_url(self) -> str:
        return (
            f"/api/communities/workspaces/{self.ws.slug}/"
            f"{self.community.slug}/members/{self.pending.pk}/approve/"
        )

    def _reject_url(self) -> str:
        return (
            f"/api/communities/workspaces/{self.ws.slug}/"
            f"{self.community.slug}/members/{self.pending.pk}/reject/"
        )

    def test_outsider_cannot_approve(self) -> None:
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.post(self._approve_url())
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_approve(self) -> None:
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post(self._approve_url())
        self.assertEqual(resp.status_code, 200)
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, CommunityMember.STATUS_MEMBER)
        self.assertIsNotNone(self.pending.decided_at)
        # Bell notif pro žadatele.
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.joe,
                kind=Notification.KIND_COMMUNITY_MEMBER_APPROVED,
            ).exists()
        )
        # Audit log.
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_COMMUNITY_MEMBER_APPROVE,
                target_id=str(self.pending.pk),
            ).exists()
        )

    def test_cannot_approve_non_pending(self) -> None:
        self.pending.status = CommunityMember.STATUS_MEMBER
        self.pending.save(update_fields=["status"])
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post(self._approve_url())
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_reject_with_reason(self) -> None:
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post(
            self._reject_url(),
            {"reason": "Nesplňuješ podmínky."},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, CommunityMember.STATUS_DECLINED)
        # Bell notif nese reason v body.
        notif = Notification.objects.get(
            recipient=self.joe,
            kind=Notification.KIND_COMMUNITY_MEMBER_REJECTED,
        )
        self.assertIn("Nesplňuješ", notif.body)
        # Audit.
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_COMMUNITY_MEMBER_REJECT,
                target_id=str(self.pending.pk),
            ).exists()
        )
