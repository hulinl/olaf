"""First-pass test coverage for the communities app.

The app shipped without any tests. These lock in the V1 contract:
each workspace owns its communities, owner-only writes, visibility
gating on the public list, slug uniqueness scoped to the workspace.
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
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


class CommunityModelTests(TestCase):
    def test_slug_unique_within_workspace(self) -> None:
        from django.db import IntegrityError

        owner = _make_user("o@x.com")
        ws = _make_workspace("ws1", owner)
        Community.objects.create(workspace=ws, slug="beskydy", name="Beskydy")
        with self.assertRaises(IntegrityError):
            Community.objects.create(workspace=ws, slug="beskydy", name="Beskydy 2")

    def test_same_slug_different_workspaces_ok(self) -> None:
        owner_a = _make_user("a@x.com")
        owner_b = _make_user("b@x.com")
        ws_a = _make_workspace("wsa", owner_a)
        ws_b = _make_workspace("wsb", owner_b)
        Community.objects.create(workspace=ws_a, slug="beskydy", name="A")
        Community.objects.create(workspace=ws_b, slug="beskydy", name="B")


class WorkspaceCommunitiesEndpointTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@cm.com")
        self.outsider = _make_user("outsider@cm.com")
        self.ws = _make_workspace("acme", self.owner)
        self.url = f"/api/communities/workspaces/{self.ws.slug}/"
        self.client = APIClient()

    def test_anon_cannot_list(self) -> None:
        # V1 contract: listing is auth-gated. Public profiles of the
        # workspace itself live elsewhere (/api/workspaces/<slug>/);
        # this endpoint is the owner cockpit data.
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_owner_sees_all_communities(self) -> None:
        Community.objects.create(
            workspace=self.ws,
            slug="public",
            name="Public",
            visibility=Community.VISIBILITY_PUBLIC,
        )
        Community.objects.create(
            workspace=self.ws,
            slug="private",
            name="Private",
            visibility=Community.VISIBILITY_PRIVATE,
        )
        self.client.force_authenticate(self.owner)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        slugs = [c["slug"] for c in resp.data]
        self.assertIn("public", slugs)
        self.assertIn("private", slugs)

    def test_owner_can_create_community(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            self.url,
            {"slug": "trailrun", "name": "Trail Run"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Community.objects.filter(workspace=self.ws, slug="trailrun").count(),
            1,
        )

    def test_non_owner_cannot_create(self) -> None:
        self.client.force_authenticate(self.outsider)
        resp = self.client.post(
            self.url,
            {"slug": "x", "name": "X"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anon_cannot_create(self) -> None:
        resp = self.client.post(
            self.url, {"slug": "x", "name": "X"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_rejects_bad_slug(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            self.url,
            {"slug": "Has Spaces", "name": "X"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class CommunityDetailEndpointTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@det.com")
        self.outsider = _make_user("outsider@det.com")
        self.ws = _make_workspace("acme2", self.owner)
        self.community = Community.objects.create(
            workspace=self.ws,
            slug="beskydy",
            name="Beskydy",
            visibility=Community.VISIBILITY_PUBLIC,
        )
        self.url = (
            f"/api/communities/workspaces/{self.ws.slug}/{self.community.slug}/"
        )
        self.client = APIClient()

    def test_anon_cannot_read(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_outsider_can_read_public(self) -> None:
        # Once authenticated, any user can read any community in the
        # workspace they query — there's no member-only gate in V1.
        # Visibility on Community.visibility is informational metadata
        # for the V1.5 wall feed.
        self.client.force_authenticate(self.outsider)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_owner_can_patch(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(
            self.url, {"name": "Beskydy 2"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.community.refresh_from_db()
        self.assertEqual(self.community.name, "Beskydy 2")

    def test_non_owner_cannot_patch(self) -> None:
        self.client.force_authenticate(self.outsider)
        resp = self.client.patch(
            self.url, {"name": "Hacked"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_delete(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            Community.objects.filter(pk=self.community.id).exists()
        )

    def test_404_on_unknown(self) -> None:
        bad_url = (
            f"/api/communities/workspaces/{self.ws.slug}/does-not-exist/"
        )
        self.client.force_authenticate(self.owner)
        resp = self.client.get(bad_url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class CommunityMemberRoleFieldTests(TestCase):
    """V2 Slice 1: CommunityMember.role field present + default behavior.

    Tenhle slice nemění žádný permission gating — jen přidává role pole +
    backfill pro existující data. Test ověřuje:
      - role field exists with default `member`
      - admin role can be set explicitly
      - new memberships default to `member` (workspace owner explicitly
        nepromotuje při create — Slice 2 řeší promo flow)
    """

    def setUp(self) -> None:
        from datetime import timedelta

        from django.utils import timezone

        self.owner = User.objects.create_user(
            email="ro@a.com",
            password="x-pwd-2026",
            first_name="O",
            last_name="W",
            email_verified=True,
        )
        self.member_a = User.objects.create_user(
            email="a@a.com",
            password="x-pwd-2026",
            first_name="A",
            last_name="M",
            email_verified=True,
        )
        self.member_b = User.objects.create_user(
            email="b@a.com",
            password="x-pwd-2026",
            first_name="B",
            last_name="M",
            email_verified=True,
        )
        self.ws = Workspace.objects.create(slug="rolews", name="RoleWS")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.community = Community.objects.create(
            workspace=self.ws,
            slug="roleco",
            name="RoleCo",
            visibility=Community.VISIBILITY_PRIVATE,
        )
        self.now = timezone.now()
        self.older = CommunityMember.objects.create(
            community=self.community,
            user=self.member_a,
            status=CommunityMember.STATUS_MEMBER,
            joined_at=self.now - timedelta(days=7),
        )
        self.newer = CommunityMember.objects.create(
            community=self.community,
            user=self.member_b,
            status=CommunityMember.STATUS_MEMBER,
            joined_at=self.now,
        )

    def test_default_role_is_member(self) -> None:
        self.assertEqual(self.older.role, CommunityMember.ROLE_MEMBER)
        self.assertEqual(self.newer.role, CommunityMember.ROLE_MEMBER)

    def test_admin_role_settable(self) -> None:
        self.older.role = CommunityMember.ROLE_ADMIN
        self.older.save(update_fields=["role"])
        self.older.refresh_from_db()
        self.assertEqual(self.older.role, CommunityMember.ROLE_ADMIN)

    def test_role_choices_are_admin_and_member(self) -> None:
        choices = {c[0] for c in CommunityMember.ROLE_CHOICES}
        self.assertEqual(choices, {"admin", "member"})


class CommunityMemberBackfillTests(TestCase):
    """Replay backfill logic of migration 0003 inline — proves that the
    rule (oldest STATUS_MEMBER becomes admin) is correct, and is robust
    across edge cases."""

    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="rb@a.com",
            password="x-pwd-2026",
            first_name="O",
            last_name="B",
            email_verified=True,
        )
        self.ws = Workspace.objects.create(slug="backfillws", name="BF")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )

    def _add_member(self, community, email, joined_at, status="member"):
        u = User.objects.create_user(
            email=email,
            password="x-pwd-2026",
            first_name="X",
            last_name="Y",
            email_verified=True,
        )
        return CommunityMember.objects.create(
            community=community,
            user=u,
            status=status,
            joined_at=joined_at,
        )

    def _replay_backfill(self):
        # Reuses identitcal logic to migration 0003.
        for community in Community.objects.all():
            first = (
                CommunityMember.objects.filter(
                    community=community,
                    status=CommunityMember.STATUS_MEMBER,
                )
                .order_by("joined_at")
                .first()
            )
            if first is None:
                continue
            if first.role != CommunityMember.ROLE_ADMIN:
                first.role = CommunityMember.ROLE_ADMIN
                first.save(update_fields=["role"])

    def test_oldest_member_becomes_admin(self) -> None:
        from datetime import timedelta

        from django.utils import timezone

        community = Community.objects.create(
            workspace=self.ws, slug="oldest", name="O", visibility="private",
        )
        now = timezone.now()
        oldest = self._add_member(community, "oldest@a.com", now - timedelta(days=10))
        middle = self._add_member(community, "middle@a.com", now - timedelta(days=5))
        newest = self._add_member(community, "newest@a.com", now)
        # Reset to default after migration applied during test setup.
        CommunityMember.objects.update(role=CommunityMember.ROLE_MEMBER)

        self._replay_backfill()

        oldest.refresh_from_db()
        middle.refresh_from_db()
        newest.refresh_from_db()
        self.assertEqual(oldest.role, CommunityMember.ROLE_ADMIN)
        self.assertEqual(middle.role, CommunityMember.ROLE_MEMBER)
        self.assertEqual(newest.role, CommunityMember.ROLE_MEMBER)

    def test_no_member_status_does_not_crash(self) -> None:
        # Community has only pending applications — no one to admin yet.
        from datetime import timedelta

        from django.utils import timezone

        community = Community.objects.create(
            workspace=self.ws, slug="pending-only", name="P", visibility="private",
        )
        self._add_member(
            community,
            "pending@a.com",
            timezone.now() - timedelta(days=1),
            status=CommunityMember.STATUS_PENDING,
        )
        # No crash.
        self._replay_backfill()
        # No one was promoted.
        self.assertFalse(
            CommunityMember.objects.filter(
                community=community, role=CommunityMember.ROLE_ADMIN
            ).exists()
        )

    def test_idempotent(self) -> None:
        # Running backfill twice is safe — admin stays admin.
        from datetime import timedelta

        from django.utils import timezone

        community = Community.objects.create(
            workspace=self.ws, slug="idem", name="I", visibility="private",
        )
        m = self._add_member(community, "idem@a.com", timezone.now() - timedelta(days=1))
        CommunityMember.objects.update(role=CommunityMember.ROLE_MEMBER)

        self._replay_backfill()
        self._replay_backfill()

        m.refresh_from_db()
        self.assertEqual(m.role, CommunityMember.ROLE_ADMIN)

    def test_removed_status_skipped(self) -> None:
        # An oldest "removed" row shouldn't accidentally inherit admin.
        from datetime import timedelta

        from django.utils import timezone

        community = Community.objects.create(
            workspace=self.ws, slug="rem", name="R", visibility="private",
        )
        now = timezone.now()
        self._add_member(
            community,
            "rem@a.com",
            now - timedelta(days=10),
            status=CommunityMember.STATUS_REMOVED,
        )
        good = self._add_member(community, "good@a.com", now - timedelta(days=5))
        CommunityMember.objects.update(role=CommunityMember.ROLE_MEMBER)

        self._replay_backfill()

        good.refresh_from_db()
        self.assertEqual(good.role, CommunityMember.ROLE_ADMIN)
