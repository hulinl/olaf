"""Workspace detail PATCH, logo, cover endpoint coverage.

Tahle skupina endpointů je každodenně používaná ownery (rebranding,
update IBAN, sociální odkazy). Dosud neměla žádné testy.
"""
from __future__ import annotations

import io

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User

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


def _png_bytes() -> bytes:
    # Smallest valid PNG bytes — magic + IHDR + IDAT + IEND. ~70 B.
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


class WorkspaceDetailPatchTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@wd.com")
        self.admin_user = _make_user("a@wd.com")
        self.outsider = _make_user("x@wd.com")
        self.ws = _make_workspace(self.owner, slug="wdws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin_user,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "workspaces:detail", kwargs={"slug": self.ws.slug}
        )

    def test_get_returns_my_role_and_member_count(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["my_role"], "owner")
        self.assertEqual(data["member_count"], 2)  # owner + admin

    def test_get_anonymous_visible_for_public(self) -> None:
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        # `my_role` je None pro anon
        self.assertIsNone(r.json()["my_role"])

    def test_get_anonymous_404_for_private(self) -> None:
        self.ws.visibility = Workspace.VISIBILITY_PRIVATE
        self.ws.save(update_fields=["visibility"])
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 404)

    def test_owner_patches_name_and_bio(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(),
            {"name": "Renamed", "bio": "New bio"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertEqual(self.ws.name, "Renamed")
        self.assertEqual(self.ws.bio, "New bio")

    def test_admin_can_patch(self) -> None:
        # `_is_owner` v workspaces/views.py dovolí i admin.
        self.client.force_authenticate(self.admin_user)
        r = self.client.patch(
            self._url(),
            {"bio": "Admin update"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertEqual(self.ws.bio, "Admin update")

    def test_outsider_cannot_patch(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(
            self._url(),
            {"bio": "Hijacked"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_anon_cannot_patch(self) -> None:
        r = self.client.patch(self._url(), {"bio": "Hijacked"}, format="json")
        self.assertIn(r.status_code, (401, 403))

    def test_patch_iban_field(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(),
            {"payment_iban": "CZ65 0800 0000 1920 0014 5399"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertIn("CZ65", self.ws.payment_iban)


class WorkspaceLogoCoverTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@img.com")
        self.outsider = _make_user("x@img.com")
        self.ws = _make_workspace(self.owner, slug="imgws")
        self.client = APIClient()

    def _logo_url(self) -> str:
        return reverse("workspaces:logo", kwargs={"slug": self.ws.slug})

    def _cover_url(self) -> str:
        return reverse("workspaces:cover", kwargs={"slug": self.ws.slug})

    def test_owner_uploads_logo(self) -> None:
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "logo.png"
        r = self.client.post(
            self._logo_url(),
            {"logo": png},
            format="multipart",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.ws.refresh_from_db()
        self.assertTrue(self.ws.logo)

    def test_owner_deletes_logo(self) -> None:
        # First upload, then delete.
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "logo.png"
        self.client.post(
            self._logo_url(), {"logo": png}, format="multipart"
        )
        r = self.client.delete(self._logo_url())
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertFalse(self.ws.logo)

    def test_outsider_cannot_upload_logo(self) -> None:
        self.client.force_authenticate(self.outsider)
        png = io.BytesIO(_png_bytes())
        png.name = "logo.png"
        r = self.client.post(
            self._logo_url(),
            {"logo": png},
            format="multipart",
        )
        self.assertEqual(r.status_code, 403)

    def test_owner_uploads_cover(self) -> None:
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "cover.png"
        r = self.client.post(
            self._cover_url(),
            {"cover": png},
            format="multipart",
        )
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertTrue(self.ws.cover)

    def test_anon_cannot_upload(self) -> None:
        png = io.BytesIO(_png_bytes())
        png.name = "logo.png"
        r = self.client.post(
            self._logo_url(),
            {"logo": png},
            format="multipart",
        )
        self.assertIn(r.status_code, (401, 403))
