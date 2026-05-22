"""Coverage extension nad rámec stávajícího `tests.py`.

Doplňuje:
- community_detail GET/PATCH/DELETE
- community_members GET/POST (bulk paste-emails)
- community_member_detail DELETE
- permission edges (admin vs owner vs member vs outsider)
"""
from __future__ import annotations

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Community, CommunityMember


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


class CommunityDetailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cd.com")
        self.outsider = _make_user("x@cd.com")
        self.ws = _make_workspace(self.owner, slug="cdws")
        self.community = Community.objects.create(
            workspace=self.ws,
            slug="hikers",
            name="Hikers",
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "communities:detail",
            kwargs={
                "workspace_slug": self.ws.slug,
                "community_slug": self.community.slug,
            },
        )

    def test_get_returns_community(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["slug"], "hikers")

    def test_patch_updates_name(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(self._url(), {"name": "Mountain Hikers"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.community.refresh_from_db()
        self.assertEqual(self.community.name, "Mountain Hikers")

    def test_patch_rejects_collision_slug(self) -> None:
        Community.objects.create(
            workspace=self.ws, slug="other-comm", name="Other"
        )
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(), {"slug": "other-comm"}, format="json"
        )
        self.assertEqual(r.status_code, 400)
        self.community.refresh_from_db()
        self.assertEqual(self.community.slug, "hikers")

    def test_patch_to_same_slug_ok(self) -> None:
        # Idempotent rename to same slug nemá selhat na collision check.
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(), {"slug": "hikers", "name": "Hikers Renamed"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)

    def test_outsider_cannot_patch(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(self._url(), {"name": "Hijacked"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.community.refresh_from_db()
        self.assertEqual(self.community.name, "Hikers")

    def test_outsider_cannot_delete(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 403)
        self.assertTrue(
            Community.objects.filter(pk=self.community.pk).exists()
        )

    def test_owner_deletes(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(
            Community.objects.filter(pk=self.community.pk).exists()
        )

    def test_unknown_community_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            reverse(
                "communities:detail",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "community_slug": "ne-existuje",
                },
            )
        )
        self.assertEqual(r.status_code, 404)


class CommunityMembersTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cm.com")
        self.outsider = _make_user("x@cm.com")
        self.ws = _make_workspace(self.owner, slug="cmws")
        self.community = Community.objects.create(
            workspace=self.ws,
            slug="cm",
            name="CM",
        )
        # Three users with existing accounts.
        self.u_a = _make_user("a@cm.com")
        self.u_b = _make_user("b@cm.com")
        self.u_c = _make_user("c@cm.com")
        self.client = APIClient()
        self.url = reverse(
            "communities:members",
            kwargs={
                "workspace_slug": self.ws.slug,
                "community_slug": self.community.slug,
            },
        )

    def test_owner_lists_members_empty(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_outsider_cannot_list(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 403)

    def test_bulk_add_existing_users(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"emails": "a@cm.com\nb@cm.com"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data["added"]), 2)
        self.assertEqual(data["skipped_already_member"], [])
        self.assertEqual(data["no_account_yet"], [])
        # Members vytvoreni in DB.
        self.assertEqual(self.community.memberships.count(), 2)

    def test_bulk_add_handles_comma_and_newline_separators(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"emails": "a@cm.com,b@cm.com\nc@cm.com"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["added"]), 3)

    def test_bulk_add_dedups_within_request(self) -> None:
        # Stejný e-mail dvakrát = jeden member, druhý jako "already member".
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"emails": "a@cm.com\na@cm.com"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data["added"]), 1)
        self.assertEqual(data["skipped_already_member"], ["a@cm.com"])

    def test_bulk_add_skips_already_members(self) -> None:
        # u_a už je member.
        CommunityMember.objects.create(
            community=self.community, user=self.u_a,
            status=CommunityMember.STATUS_MEMBER,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"emails": "a@cm.com\nb@cm.com"},
            format="json",
        )
        data = r.json()
        self.assertEqual(len(data["added"]), 1)
        self.assertEqual(data["skipped_already_member"], ["a@cm.com"])

    def test_bulk_add_reports_unknown_emails(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"emails": "a@cm.com\nfake@nowhere.com"},
            format="json",
        )
        data = r.json()
        self.assertEqual(len(data["added"]), 1)
        self.assertEqual(data["no_account_yet"], ["fake@nowhere.com"])

    def test_email_match_case_insensitive(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"emails": "A@CM.COM"},
            format="json",
        )
        data = r.json()
        self.assertEqual(len(data["added"]), 1)

    def test_empty_emails_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {"emails": "   "}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_outsider_cannot_add(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self.url, {"emails": "a@cm.com"}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.community.memberships.count(), 0)


class CommunityMemberDeleteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cmd.com")
        self.outsider = _make_user("x@cmd.com")
        self.member_user = _make_user("m@cmd.com")
        self.ws = _make_workspace(self.owner, slug="cmdws")
        self.community = Community.objects.create(
            workspace=self.ws, slug="cmd", name="CMD"
        )
        self.member = CommunityMember.objects.create(
            community=self.community,
            user=self.member_user,
            status=CommunityMember.STATUS_MEMBER,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "communities:member-detail",
            kwargs={
                "workspace_slug": self.ws.slug,
                "community_slug": self.community.slug,
                "member_id": self.member.pk,
            },
        )

    def test_owner_soft_removes_member(self) -> None:
        # Community member je *soft-removed* (status flipne na REMOVED),
        # ne hard-delete. Audit pointer `decided_at` se taky nastaví.
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.member.refresh_from_db()
        self.assertEqual(self.member.status, CommunityMember.STATUS_REMOVED)
        self.assertIsNotNone(self.member.decided_at)

    def test_outsider_cannot_remove(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 403)

    def test_unknown_member_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(
            reverse(
                "communities:member-detail",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "community_slug": self.community.slug,
                    "member_id": 99999,
                },
            )
        )
        self.assertEqual(r.status_code, 404)
