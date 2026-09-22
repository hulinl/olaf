"""Tests for workspace public self-serve join + admin approval flow.

Mirror communities/tests_join.py — workspace-level ekvivalent shipnutý
2026-09-22 pro tenanty, které dělají tenant/creator = "komunita" a
nemají žádnou vnitřní Community.
"""
from __future__ import annotations

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from notifications.models import Notification

from .models import Workspace, WorkspaceMember


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="A",
        last_name="B",
        email_verified=True,
    )


def _make_workspace(
    slug: str, owner: User, visibility: str = Workspace.VISIBILITY_PUBLIC
) -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title(), visibility=visibility)
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


class WorkspaceJoinTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@wj.cm")
        self.joe = _make_user("joe@wj.cm")
        self.public = _make_workspace("public-ws", self.owner)
        self.unlisted = _make_workspace(
            "unlisted-ws", self.owner, Workspace.VISIBILITY_UNLISTED
        )
        self.private = _make_workspace(
            "private-ws", self.owner, Workspace.VISIBILITY_PRIVATE
        )
        self.client = APIClient()

    def _url(self, ws: Workspace) -> str:
        return f"/api/workspaces/{ws.slug}/join/"

    def test_anon_without_account_gets_400(self) -> None:
        resp = self.client.post(self._url(self.public))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_anon_can_join_with_account_payload(self) -> None:
        resp = self.client.post(
            self._url(self.public),
            {
                "account": {
                    "email": "anon@wj.cm",
                    "first_name": "Anna",
                    "last_name": "Nová",
                }
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")
        guest = User.objects.get(email="anon@wj.cm")
        self.assertFalse(guest.email_verified)
        self.assertFalse(guest.has_usable_password())
        row = WorkspaceMember.objects.get(workspace=self.public, user=guest)
        self.assertEqual(row.status, WorkspaceMember.STATUS_PENDING)
        self.assertEqual(row.role, WorkspaceMember.ROLE_MEMBER)
        # Owner dostal bell notif.
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.owner,
                kind=Notification.KIND_WORKSPACE_JOIN_REQUEST,
            ).exists()
        )

    def test_anon_with_verified_email_gets_409(self) -> None:
        User.objects.create_user(
            email="already@wj.cm",
            password="alpine-hike-2026",
            first_name="Al",
            last_name="Ready",
            email_verified=True,
        )
        resp = self.client.post(
            self._url(self.public),
            {
                "account": {
                    "email": "already@wj.cm",
                    "first_name": "Any",
                    "last_name": "Body",
                }
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data.get("code"), "email_has_account")
        self.assertFalse(
            WorkspaceMember.objects.filter(
                workspace=self.public, user__email="already@wj.cm"
            ).exists()
        )

    def test_auth_user_can_join_public(self) -> None:
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._url(self.public))
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")
        row = WorkspaceMember.objects.get(
            workspace=self.public, user=self.joe
        )
        self.assertEqual(row.status, WorkspaceMember.STATUS_PENDING)

    def test_join_is_idempotent_pending(self) -> None:
        self.client.force_authenticate(user=self.joe)
        self.client.post(self._url(self.public))
        resp = self.client.post(self._url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "already_pending")
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.public, user=self.joe
            ).count(),
            1,
        )

    def test_join_is_idempotent_member(self) -> None:
        WorkspaceMember.objects.create(
            workspace=self.public,
            user=self.joe,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "already_member")

    def test_re_request_after_removed(self) -> None:
        WorkspaceMember.objects.create(
            workspace=self.public,
            user=self.joe,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_REMOVED,
            decided_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._url(self.public))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "pending")
        row = WorkspaceMember.objects.get(
            workspace=self.public, user=self.joe
        )
        self.assertEqual(row.status, WorkspaceMember.STATUS_PENDING)
        self.assertIsNone(row.decided_at)

    def test_unlisted_rejects_self_join(self) -> None:
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._url(self.unlisted))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_private_rejects_self_join(self) -> None:
        self.client.force_authenticate(user=self.joe)
        resp = self.client.post(self._url(self.private))
        # Private workspace vrací 404 v public_workspace endpointu, ale
        # /join/ nekontroluje visibility jako "existence leak" — jen
        # jestli je open pro self-serve. Ne-public = 403.
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_members_endpoint_hides_pending(self) -> None:
        # Sanity: workspace_members neukazuje pending žadatele jako členy.
        self.client.force_authenticate(user=self.joe)
        self.client.post(self._url(self.public))
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(f"/api/workspaces/{self.public.slug}/members/")
        self.assertEqual(resp.status_code, 200)
        emails = [row["email"] for row in resp.data]
        self.assertNotIn(self.joe.email, emails)


class WorkspaceApproveRejectTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@ar.wj")
        self.joe = _make_user("joe@ar.wj")
        self.outsider = _make_user("outsider@ar.wj")
        self.ws = _make_workspace("acme-ws", self.owner)
        self.pending = WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.joe,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_PENDING,
        )
        self.client = APIClient()

    def _approve_url(self) -> str:
        return (
            f"/api/workspaces/{self.ws.slug}/members/{self.pending.pk}/approve/"
        )

    def _reject_url(self) -> str:
        return (
            f"/api/workspaces/{self.ws.slug}/members/{self.pending.pk}/reject/"
        )

    def _pending_list_url(self) -> str:
        return f"/api/workspaces/{self.ws.slug}/pending-members/"

    def test_outsider_cannot_approve(self) -> None:
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.post(self._approve_url())
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_approve(self) -> None:
        self.client.force_authenticate(user=self.owner)
        resp = self.client.post(self._approve_url())
        self.assertEqual(resp.status_code, 200)
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, WorkspaceMember.STATUS_ACTIVE)
        self.assertIsNotNone(self.pending.decided_at)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.joe,
                kind=Notification.KIND_WORKSPACE_MEMBER_APPROVED,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_WORKSPACE_MEMBER_APPROVE,
                target_id=str(self.pending.pk),
            ).exists()
        )

    def test_cannot_approve_non_pending(self) -> None:
        self.pending.status = WorkspaceMember.STATUS_ACTIVE
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
        self.assertEqual(self.pending.status, WorkspaceMember.STATUS_REMOVED)
        notif = Notification.objects.get(
            recipient=self.joe,
            kind=Notification.KIND_WORKSPACE_MEMBER_REJECTED,
        )
        self.assertIn("Nesplňuješ", notif.body)
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_WORKSPACE_MEMBER_REJECT,
                target_id=str(self.pending.pk),
            ).exists()
        )

    def test_pending_list_owner_only(self) -> None:
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.get(self._pending_list_url())
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_list_returns_pending_rows(self) -> None:
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(self._pending_list_url())
        self.assertEqual(resp.status_code, 200)
        ids = [row["id"] for row in resp.data]
        self.assertEqual(ids, [self.pending.pk])
