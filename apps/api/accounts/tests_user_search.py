"""User search endpoint tests — GET /api/auth/users/search/?q=..."""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember


class UserSearchTests(TestCase):
    """Global user picker endpoint. Auth-only, min 2 chars, sorted by
    exact-email + shared-workspace relevance."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.me = User.objects.create_user(
            email="me@example.com",
            password="pass-abcdef-1234",
            first_name="Olaf",
            last_name="Hulin",
            email_verified=True,
        )
        self.jana = User.objects.create_user(
            email="jana@example.com",
            password="pass-abcdef-1234",
            first_name="Jana",
            last_name="Nováková",
            email_verified=True,
        )
        self.jan = User.objects.create_user(
            email="jan.novak@example.com",
            password="pass-abcdef-1234",
            first_name="Jan",
            last_name="Novák",
            email_verified=True,
        )
        self.petr = User.objects.create_user(
            email="petr@example.com",
            password="pass-abcdef-1234",
            first_name="Petr",
            last_name="Zdlouhavý",
            email_verified=True,
        )
        # Shared workspace: me + jana v Olaf Adventures.
        self.ws = Workspace.objects.create(slug="olaf-adventures", name="Olaf Adventures")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.me, role=WorkspaceMember.ROLE_OWNER
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.jana, role=WorkspaceMember.ROLE_ADMIN
        )
        self.url = reverse("accounts:user-search")

    def test_unauthenticated_blocked(self) -> None:
        r = self.client.get(self.url, {"q": "jana"})
        # DRF vrací 401 pro anonymního uživatele s IsAuthenticated.
        self.assertIn(
            r.status_code,
            (drf_status.HTTP_401_UNAUTHORIZED, drf_status.HTTP_403_FORBIDDEN),
        )

    def test_short_query_returns_empty(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "j"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_search_by_first_name(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "jan"})
        self.assertEqual(r.status_code, 200)
        emails = [u["email"] for u in r.json()]
        # Both Jana + Jan match — Jana má shared workspace, tak je první.
        self.assertIn("jana@example.com", emails)
        self.assertIn("jan.novak@example.com", emails)

    def test_search_by_email_exact_bumps_to_top(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "jan.novak@example.com"})
        results = r.json()
        # Exact email match musí být první.
        self.assertEqual(results[0]["email"], "jan.novak@example.com")

    def test_shared_workspace_ranks_higher(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "jan"})
        results = r.json()
        # Jana (shared workspace) před Janem (bez shared).
        self.assertEqual(results[0]["email"], "jana@example.com")

    def test_shared_workspace_badge_present(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "jana"})
        results = r.json()
        self.assertEqual(len(results), 1)
        shared = results[0]["shared_workspaces"]
        self.assertEqual(len(shared), 1)
        self.assertEqual(shared[0]["slug"], "olaf-adventures")
        self.assertEqual(shared[0]["role"], "admin")

    def test_search_excludes_self(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "olaf"})
        emails = [u["email"] for u in r.json()]
        self.assertNotIn(self.me.email, emails)

    def test_full_name_multi_token_search(self) -> None:
        self.client.force_authenticate(self.me)
        r = self.client.get(self.url, {"q": "jan novak"})
        results = r.json()
        emails = [u["email"] for u in results]
        # Multi-token AND — musí matchovat oba tokeny.
        self.assertIn("jan.novak@example.com", emails)
        self.assertNotIn("petr@example.com", emails)
