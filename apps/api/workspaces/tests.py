from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User

from .middleware import TenantResolverMiddleware
from .models import Workspace, WorkspaceMember
from .validators import validate_workspace_slug


class SlugValidatorTests(TestCase):
    def test_accepts_simple_slug(self) -> None:
        validate_workspace_slug("olafadventures")

    def test_accepts_hyphenated(self) -> None:
        validate_workspace_slug("acme-team")

    def test_rejects_uppercase(self) -> None:
        with self.assertRaises(ValidationError):
            validate_workspace_slug("OlafAdventures")

    def test_rejects_underscore(self) -> None:
        with self.assertRaises(ValidationError):
            validate_workspace_slug("olaf_adventures")

    def test_rejects_leading_hyphen(self) -> None:
        with self.assertRaises(ValidationError):
            validate_workspace_slug("-olaf")

    def test_rejects_reserved_slug_dashboard(self) -> None:
        with self.assertRaises(ValidationError):
            validate_workspace_slug("dashboard")

    def test_rejects_reserved_slug_admin(self) -> None:
        with self.assertRaises(ValidationError):
            validate_workspace_slug("admin")

    def test_rejects_too_long(self) -> None:
        with self.assertRaises(ValidationError):
            validate_workspace_slug("x" * 51)


class WorkspaceModelTests(TestCase):
    def test_create_workspace_with_owner(self) -> None:
        owner = User.objects.create_user(
            email="owner@example.com",
            password="alpine-hike-2026",
            first_name="Owner",
            last_name="One",
        )
        ws = Workspace.objects.create(slug="acme-team", name="ACME Team")
        WorkspaceMember.objects.create(
            workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.assertEqual(ws.members.count(), 1)
        self.assertEqual(ws.members.first().user, owner)

    def test_slug_unique(self) -> None:
        from django.db import IntegrityError

        Workspace.objects.create(slug="acme-team", name="ACME Team")
        with self.assertRaises(IntegrityError):
            Workspace.objects.create(slug="acme-team", name="ACME Team 2")


class PublicWorkspaceEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.public_ws = Workspace.objects.create(
            slug="public-org",
            name="Public Org",
            visibility=Workspace.VISIBILITY_PUBLIC,
            bio="Hello world.",
        )
        self.unlisted_ws = Workspace.objects.create(
            slug="unlisted-org",
            name="Unlisted Org",
            visibility=Workspace.VISIBILITY_UNLISTED,
        )
        self.private_ws = Workspace.objects.create(
            slug="private-org",
            name="Private Org",
            visibility=Workspace.VISIBILITY_PRIVATE,
        )

    def url(self, slug: str) -> str:
        return reverse("workspaces:public", kwargs={"slug": slug})

    def test_public_workspace_visible_to_anyone(self) -> None:
        resp = self.client.get(self.url("public-org"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["name"], "Public Org")
        self.assertEqual(resp.json()["bio"], "Hello world.")

    def test_unlisted_workspace_visible_to_anyone_with_link(self) -> None:
        # PRD §4.3: unlisted = accessible with direct link.
        resp = self.client.get(self.url("unlisted-org"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_private_workspace_404_to_non_member(self) -> None:
        resp = self.client.get(self.url("private-org"))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_private_workspace_visible_to_member(self) -> None:
        user = User.objects.create_user(
            email="member@example.com",
            password="alpine-hike-2026",
            first_name="Member",
            last_name="One",
            email_verified=True,
        )
        WorkspaceMember.objects.create(workspace=self.private_ws, user=user)
        self.client.force_authenticate(user)
        resp = self.client.get(self.url("private-org"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unknown_slug_returns_404(self) -> None:
        resp = self.client.get(self.url("nonexistent"))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class MyWorkspacesEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="user@example.com",
            password="alpine-hike-2026",
            first_name="User",
            last_name="One",
            email_verified=True,
        )
        self.url = reverse("workspaces:mine")

    def test_unauthenticated_rejected(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_returns_user_workspaces(self) -> None:
        ws1 = Workspace.objects.create(slug="ws-one", name="Workspace One")
        ws2 = Workspace.objects.create(slug="ws-two", name="Workspace Two")
        Workspace.objects.create(slug="ws-other", name="Other Workspace")
        WorkspaceMember.objects.create(workspace=ws1, user=self.user)
        WorkspaceMember.objects.create(workspace=ws2, user=self.user)

        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        slugs = {w["slug"] for w in resp.json()["results"]} \
            if "results" in resp.json() else {w["slug"] for w in resp.json()}
        self.assertEqual(slugs, {"ws-one", "ws-two"})


class TenantResolverMiddlewareTests(TestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()
        self.middleware = TenantResolverMiddleware(get_response=lambda r: None)
        self.ws = Workspace.objects.create(slug="acme-team", name="ACME")

    def _resolve(self, path: str):
        req = self.factory.get(path)
        return self.middleware._resolve(req)

    def test_resolves_workspace_slug(self) -> None:
        self.assertEqual(self._resolve("/acme-team"), self.ws)
        self.assertEqual(self._resolve("/acme-team/"), self.ws)
        self.assertEqual(self._resolve("/acme-team/whatever"), self.ws)

    def test_ignores_api_paths(self) -> None:
        self.assertIsNone(self._resolve("/api/workspaces/acme-team/"))

    def test_ignores_admin_paths(self) -> None:
        self.assertIsNone(self._resolve("/admin/"))

    def test_ignores_media_paths(self) -> None:
        self.assertIsNone(self._resolve("/media/foo.jpg"))

    def test_unknown_slug_returns_none(self) -> None:
        self.assertIsNone(self._resolve("/nonexistent-workspace"))
