"""Lidé CRM endpoint coverage — tags + notes + tag-assignment.

Tahle skupina endpointů byla untested. Pro pořadatele, kteří
spravují stovky lidí napříč desítkami akcí, je CRM kritický
backbone — bugy se projeví jako mizející tagy nebo špatně přiřazené
poznámky napříč členy.
"""
from __future__ import annotations

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User

from .models import (
    PersonProfile,
    PersonTag,
    Workspace,
    WorkspaceMember,
)


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


class PersonTagsListCreateTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@tag.com")
        self.admin_user = _make_user("a@tag.com")
        self.outsider = _make_user("x@tag.com")
        self.ws = _make_workspace(self.owner, slug="tagws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin_user,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse("workspaces:tags", kwargs={"slug": self.ws.slug})

    def test_owner_lists_empty(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_owner_creates_tag(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self._url(),
            {"name": "VIP", "color": "#f59e0b"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["name"], "VIP")
        self.assertEqual(r.json()["color"], "#f59e0b")

    def test_admin_can_create_tag(self) -> None:
        # `_is_owner` v workspaces dovolí admin → create OK.
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(
            self._url(),
            {"name": "Regular"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)

    def test_duplicate_tag_returns_existing(self) -> None:
        # get_or_create — druhý POST se stejným jménem vrátí 200 a
        # existující tag (ne 400/duplicate).
        self.client.force_authenticate(self.owner)
        r1 = self.client.post(self._url(), {"name": "VIP"}, format="json")
        r2 = self.client.post(self._url(), {"name": "VIP"}, format="json")
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r1.json()["id"], r2.json()["id"])

    def test_empty_name_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(), {"name": "  "}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_name_truncated_to_40_chars(self) -> None:
        self.client.force_authenticate(self.owner)
        long_name = "a" * 100
        r = self.client.post(self._url(), {"name": long_name}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.json()["name"]), 40)

    def test_outsider_cannot_list(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 403)

    def test_outsider_cannot_create(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self._url(), {"name": "T"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self._url())
        self.assertIn(r.status_code, (401, 403))


class PersonTagDetailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@td.com")
        self.outsider = _make_user("x@td.com")
        self.ws = _make_workspace(self.owner, slug="tdws")
        self.tag = PersonTag.objects.create(
            workspace=self.ws, name="VIP", color="#f00"
        )
        self.client = APIClient()

    def _url(self, tag_id: int | None = None) -> str:
        return reverse(
            "workspaces:tag-detail",
            kwargs={"slug": self.ws.slug, "tag_id": tag_id or self.tag.pk},
        )

    def test_owner_renames(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(), {"name": "Premium"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.tag.refresh_from_db()
        self.assertEqual(self.tag.name, "Premium")

    def test_owner_recolors(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(), {"color": "#0f0"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.tag.refresh_from_db()
        self.assertEqual(self.tag.color, "#0f0")

    def test_owner_deletes(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(PersonTag.objects.filter(pk=self.tag.pk).exists())

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(
            self._url(), {"name": "Hijacked"}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        self.tag.refresh_from_db()
        self.assertEqual(self.tag.name, "VIP")

    def test_unknown_tag_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(tag_id=99999), {"name": "X"}, format="json"
        )
        self.assertEqual(r.status_code, 404)

    def test_tag_from_other_workspace_404(self) -> None:
        # Tag patří jinému workspace — endpoint na slug=tdws nesmí ho najít.
        other_owner = _make_user("o2@td.com")
        other_ws = _make_workspace(other_owner, slug="otherws")
        foreign_tag = PersonTag.objects.create(
            workspace=other_ws, name="Foreign"
        )
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(tag_id=foreign_tag.pk),
            {"name": "Hijacked"},
            format="json",
        )
        self.assertEqual(r.status_code, 404)


class PersonNoteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@pn.com")
        self.member = _make_user("m@pn.com")
        self.outsider = _make_user("x@pn.com")
        self.ws = _make_workspace(self.owner, slug="pnws")
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "workspaces:member-note",
            kwargs={"slug": self.ws.slug, "user_id": self.member.pk},
        )

    def test_owner_sets_note(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(),
            {"note": "Pozor — vegetarián, alergie na ořechy."},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("vegetarián", r.json()["note"])
        # Profile vytvořen.
        profile = PersonProfile.objects.get(workspace=self.ws, user=self.member)
        self.assertIn("vegetarián", profile.note)

    def test_note_truncated_to_5000(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(),
            {"note": "x" * 6000},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["note"]), 5000)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(
            self._url(),
            {"note": "Hijacked"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            reverse(
                "workspaces:member-note",
                kwargs={"slug": self.ws.slug, "user_id": 99999},
            ),
            {"note": "X"},
            format="json",
        )
        self.assertEqual(r.status_code, 404)


class PersonTagAssignmentTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@pta.com")
        self.member = _make_user("m@pta.com")
        self.outsider = _make_user("x@pta.com")
        self.ws = _make_workspace(self.owner, slug="ptaws")
        self.tag = PersonTag.objects.create(workspace=self.ws, name="VIP")
        self.client = APIClient()

    def _url(self, user_id: int | None = None, tag_id: int | None = None) -> str:
        return reverse(
            "workspaces:member-tag",
            kwargs={
                "slug": self.ws.slug,
                "user_id": user_id or self.member.pk,
                "tag_id": tag_id or self.tag.pk,
            },
        )

    def test_owner_attaches_tag(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertIn(self.tag.pk, r.json()["tag_ids"])
        # Profile vytvořen, tag připojený.
        profile = PersonProfile.objects.get(workspace=self.ws, user=self.member)
        self.assertTrue(profile.tags.filter(pk=self.tag.pk).exists())

    def test_owner_detaches_tag(self) -> None:
        # Předem attach.
        profile = PersonProfile.objects.create(
            workspace=self.ws, user=self.member
        )
        profile.tags.add(self.tag)
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["tag_ids"], [])
        profile.refresh_from_db()
        self.assertEqual(profile.tags.count(), 0)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 403)

    def test_unknown_tag_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(tag_id=99999))
        self.assertEqual(r.status_code, 404)

    def test_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url(user_id=99999))
        self.assertEqual(r.status_code, 404)

    def test_attach_is_idempotent(self) -> None:
        # POST dvakrát — pořád jeden tag (m2m get_or_create-like).
        self.client.force_authenticate(self.owner)
        self.client.post(self._url())
        self.client.post(self._url())
        profile = PersonProfile.objects.get(workspace=self.ws, user=self.member)
        self.assertEqual(profile.tags.count(), 1)
