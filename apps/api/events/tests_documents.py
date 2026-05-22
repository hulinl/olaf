"""RSVP document upload/delete endpoint coverage.

Účastník placené/regulované akce nahrává dokumenty (smlouva, pas,
zdravotní potvrzení). Bug tady = participant nemůže doložit nutné
dokumenty a akce mu padne kvůli nesplněným požadavkům.
"""
from __future__ import annotations

import io
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event, RSVPDocument


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


def _make_event(ws: Workspace, slug: str = "ev", **overrides) -> Event:
    starts = timezone.now() + timedelta(days=14)
    defaults = {
        "slug": slug,
        "title": f"E {slug}",
        "starts_at": starts,
        "ends_at": starts + timedelta(hours=4),
        "status": Event.STATUS_PUBLISHED,
        "required_documents": [
            {"key": "liability", "label": "Souhlas s odpovědností", "required": True},
            {"key": "hike-pass", "label": "Horský průkaz", "required": True},
        ],
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=ws, **defaults)


def _fake_file(name: str = "doc.pdf") -> io.BytesIO:
    f = io.BytesIO(b"%PDF-1.4 fake content")
    f.name = name
    return f


class DocumentListUploadTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@doc.com")
        self.participant = _make_user("p@doc.com")
        self.outsider = _make_user("x@doc.com")
        self.ws = _make_workspace(self.owner, slug="docws")
        self.event = _make_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()
        self.url = reverse(
            "events:rsvp-documents",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_user_without_rsvp_404(self) -> None:
        no_rsvp = _make_user("no@doc.com")
        self.client.force_authenticate(no_rsvp)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_participant_lists_required_and_uploaded(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        # Required schema je passthrough z eventu.
        keys = [d["key"] for d in data["required"]]
        self.assertEqual(set(keys), {"liability", "hike-pass"})
        # Žádné uploads ještě.
        self.assertEqual(data["uploaded"], [])

    def test_participant_uploads_document(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.post(
            self.url,
            {"key": "liability", "file": _fake_file()},
            format="multipart",
        )
        self.assertEqual(r.status_code, 201, r.content)
        # DB row exists.
        doc = RSVPDocument.objects.get(rsvp=self.rsvp, key="liability")
        self.assertTrue(doc.original_name)

    def test_upload_missing_key_400(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.post(
            self.url, {"file": _fake_file()}, format="multipart"
        )
        self.assertEqual(r.status_code, 400)

    def test_upload_missing_file_400(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.post(
            self.url, {"key": "liability"}, format="multipart"
        )
        self.assertEqual(r.status_code, 400)

    def test_upload_unknown_key_400(self) -> None:
        # Key, který není v event.required_documents → odmítnut.
        # Chrání proti zacuckávání UI volných klíčů.
        self.client.force_authenticate(self.participant)
        r = self.client.post(
            self.url,
            {"key": "made-up-key", "file": _fake_file()},
            format="multipart",
        )
        self.assertEqual(r.status_code, 400)

    def test_outsider_404_no_rsvp(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self.url,
            {"key": "liability", "file": _fake_file()},
            format="multipart",
        )
        self.assertEqual(r.status_code, 404)


class DocumentDeleteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@dd.com")
        self.participant = _make_user("p@dd.com")
        self.other = _make_user("x@dd.com")
        self.ws = _make_workspace(self.owner, slug="ddws")
        self.event = _make_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.doc = RSVPDocument.objects.create(
            rsvp=self.rsvp,
            key="liability",
            file="liability.pdf",
            original_name="moje-smlouva.pdf",
        )
        self.client = APIClient()

    def _url(self, doc_id: int | None = None) -> str:
        return reverse(
            "events:rsvp-document-detail",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "document_id": doc_id or self.doc.pk,
            },
        )

    def test_participant_deletes_own_document(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(RSVPDocument.objects.filter(pk=self.doc.pk).exists())

    def test_other_user_404(self) -> None:
        self.client.force_authenticate(self.other)
        r = self.client.delete(self._url())
        # Endpoint nejdřív filtruje rsvp, takže user bez RSVP dostane
        # 404 (ne 403) — `_my_rsvp_or_404`.
        self.assertEqual(r.status_code, 404)

    def test_verified_document_cannot_be_deleted(self) -> None:
        # Owner už dokument ověřil → účastník ho nemůže smazat.
        self.doc.verified_at = timezone.now()
        self.doc.save(update_fields=["verified_at"])
        self.client.force_authenticate(self.participant)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 400)
        self.assertTrue(RSVPDocument.objects.filter(pk=self.doc.pk).exists())

    def test_unknown_document_404(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.delete(self._url(doc_id=99999))
        self.assertEqual(r.status_code, 404)

    def test_cross_rsvp_isolation(self) -> None:
        # Document patří jiné RSVP — endpoint by ji ne měl smazat.
        other_user = _make_user("other@dd.com")
        other_rsvp = RSVP.objects.create(
            event=self.event,
            user=other_user,
            status=RSVP.STATUS_YES,
        )
        foreign_doc = RSVPDocument.objects.create(
            rsvp=other_rsvp,
            key="liability",
            file="x.pdf",
        )
        self.client.force_authenticate(self.participant)
        r = self.client.delete(self._url(doc_id=foreign_doc.pk))
        # participant's RSVP doesn't own foreign_doc → 404
        self.assertEqual(r.status_code, 404)
        self.assertTrue(RSVPDocument.objects.filter(pk=foreign_doc.pk).exists())

    def test_anon_blocked(self) -> None:
        r = self.client.delete(self._url())
        self.assertIn(r.status_code, (401, 403))
