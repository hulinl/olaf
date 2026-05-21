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
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

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


class BulkInvitationsTests(TestCase):
    """Coverage for POST /api/workspaces/<slug>/invitations/bulk/.

    Bulk-upload is the CSV import path the user reaches for when
    onboarding a 50-person camp at once. The single-invite endpoint
    already had the right semantics (direct add for existing users,
    invitation row + e-mail for new); bulk runs the same logic per
    row and reports back what happened so the UI can show counts.
    """

    def setUp(self) -> None:
        from .models import Workspace, WorkspaceMember

        self.owner = User.objects.create_user(
            email="owner@bulk.example.com",
            password="alpine-hike-2026",
            first_name="Owner",
            last_name="One",
        )
        self.ws = Workspace.objects.create(slug="bulk-org", name="Bulk Org")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = f"/api/workspaces/{self.ws.slug}/invitations/bulk/"

    def test_anonymous_blocked(self) -> None:
        anon = APIClient()
        resp = anon.post(self.url, {"emails": "a@x.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_owner_403(self) -> None:
        outsider = User.objects.create_user(
            email="other@bulk.example.com",
            password="alpine-hike-2026",
        )
        c = APIClient()
        c.force_authenticate(outsider)
        resp = c.post(self.url, {"emails": "a@x.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_empty_body_400(self) -> None:
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invites_new_emails_creates_invitations(self) -> None:
        from .models import WorkspaceInvitation

        resp = self.client.post(
            self.url,
            {"emails": "a@new.com\nb@new.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["invited"]), 2)
        self.assertEqual(len(resp.data["added"]), 0)
        self.assertEqual(
            WorkspaceInvitation.objects.filter(workspace=self.ws).count(), 2
        )

    def test_adds_existing_users_directly(self) -> None:
        from .models import WorkspaceMember

        User.objects.create_user(
            email="already@user.com",
            password="alpine-hike-2026",
        )
        resp = self.client.post(
            self.url,
            {"emails": "already@user.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["added"]), 1)
        self.assertEqual(len(resp.data["invited"]), 0)
        self.assertTrue(
            WorkspaceMember.objects.filter(
                workspace=self.ws, user__email="already@user.com"
            ).exists()
        )

    def test_idempotent_on_reupload(self) -> None:
        from .models import WorkspaceInvitation

        self.client.post(
            self.url,
            {"emails": "a@new.com"},
            format="json",
        )
        # Second upload — should not create a duplicate invitation.
        resp = self.client.post(
            self.url,
            {"emails": "a@new.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["invited"]), 0)
        self.assertEqual(resp.data["already_invited"], ["a@new.com"])
        self.assertEqual(
            WorkspaceInvitation.objects.filter(workspace=self.ws).count(), 1
        )

    def test_skips_existing_member(self) -> None:
        from .models import WorkspaceMember

        member = User.objects.create_user(
            email="member@user.com",
            password="alpine-hike-2026",
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        resp = self.client.post(
            self.url,
            {"emails": "member@user.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["already_member"], ["member@user.com"])

    def test_rejects_bad_format(self) -> None:
        resp = self.client.post(
            self.url,
            {"emails": "not-an-email\n@@@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["invalid"]), 2)
        self.assertEqual(len(resp.data["invited"]), 0)

    def test_csv_separator_comma_and_semicolon(self) -> None:
        # Pasting a row from a spreadsheet often uses commas or
        # semicolons — the parser should treat both as separators.
        resp = self.client.post(
            self.url,
            {"emails": "a@x.com, b@x.com; c@x.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["invited"]), 3)

    def test_structured_entries_with_per_row_role(self) -> None:
        from .models import WorkspaceInvitation

        resp = self.client.post(
            self.url,
            {
                "entries": [
                    {"email": "admin@x.com", "role": "admin"},
                    {"email": "member@x.com"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admin_inv = WorkspaceInvitation.objects.get(
            workspace=self.ws, email="admin@x.com"
        )
        member_inv = WorkspaceInvitation.objects.get(
            workspace=self.ws, email="member@x.com"
        )
        self.assertEqual(admin_inv.role, WorkspaceMember.ROLE_ADMIN)
        self.assertEqual(member_inv.role, WorkspaceMember.ROLE_MEMBER)

    def test_default_role_applies_when_missing(self) -> None:
        from .models import WorkspaceInvitation

        resp = self.client.post(
            self.url,
            {"emails": "a@x.com\nb@x.com", "role": "admin"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for inv in WorkspaceInvitation.objects.filter(workspace=self.ws):
            self.assertEqual(inv.role, WorkspaceMember.ROLE_ADMIN)

    def test_dedupes_within_one_upload(self) -> None:
        resp = self.client.post(
            self.url,
            {"emails": "dup@x.com\ndup@x.com\nDUP@x.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Three lines but only one unique e-mail (case-insensitive) —
        # exactly one invitation created.
        self.assertEqual(len(resp.data["invited"]), 1)
