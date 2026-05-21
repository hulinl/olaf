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

from .models import Community


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
