"""Workspace bulk e-mail endpoint coverage.

Surface pro mass-email z Lidé CRM — owner pošle jeden e-mail
N účastníkům najednou. High risk věci k chytit:
- spam vector (limit počtu, scope eligibility)
- privacy (To: header jen jednomu, ne BCC list)
- reply-to routing zpátky na ownera
"""
from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event

from .models import Workspace, WorkspaceMember


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


class BulkEmailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@be.com", first_name="Olaf", last_name="Hulin")
        self.member = _make_user("m@be.com")
        self.rsvped = _make_user("r@be.com")
        self.outsider = _make_user("x@be.com")
        self.ws = Workspace.objects.create(slug="bews", name="BE")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        # RSVPed user — eligible přes RSVP path, ne role.
        starts = timezone.now() + timedelta(days=14)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="ev",
            title="E",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(
            event=self.event, user=self.rsvped, status=RSVP.STATUS_YES
        )
        self.client = APIClient()
        self.url = reverse(
            "workspaces:members-bulk-email",
            kwargs={"slug": self.ws.slug},
        )
        mail.outbox.clear()

    def test_owner_sends_to_eligible_member(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {
                "user_ids": [self.member.pk],
                "subject": "Reminder",
                "body": "Don't forget the camp.",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, "Reminder")
        self.assertEqual(msg.to, ["m@be.com"])
        # Reply-to ownerovi.
        self.assertEqual(msg.reply_to, ["o@be.com"])
        # Body obsahuje footer s owner jménem + workspace.
        self.assertIn("Olaf Hulin", msg.body)
        self.assertIn("BE", msg.body)

    def test_outsider_not_eligible_skipped(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {
                "user_ids": [self.outsider.pk],
                "subject": "Reminder",
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["sent"], 0)
        self.assertEqual(r.json()["skipped"], 1)
        self.assertEqual(len(mail.outbox), 0)

    def test_rsvped_user_is_eligible(self) -> None:
        # RSVPed user (žádný explicit role) je v eligible scope.
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {
                "user_ids": [self.rsvped.pk],
                "subject": "Reminder",
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(r.json()["sent"], 1)

    def test_multiple_recipients_one_email_each(self) -> None:
        # Privacy: každý dostane vlastní e-mail (vlastní To: header),
        # ne BCC list.
        self.client.force_authenticate(self.owner)
        self.client.post(
            self.url,
            {
                "user_ids": [self.member.pk, self.rsvped.pk],
                "subject": "Reminder",
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(len(mail.outbox), 2)
        # Každý zpráva má jen JEDEN recipient.
        for msg in mail.outbox:
            self.assertEqual(len(msg.to), 1)
            # Není to BCC list.
            self.assertEqual(msg.bcc, [])

    def test_cancelled_rsvp_excluded_from_eligibility(self) -> None:
        cancelled_user = _make_user("c@be.com")
        RSVP.objects.create(
            event=self.event,
            user=cancelled_user,
            status=RSVP.STATUS_CANCELLED,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {
                "user_ids": [cancelled_user.pk],
                "subject": "x",
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(r.json()["sent"], 0)

    def test_outsider_cannot_use_endpoint(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self.url,
            {
                "user_ids": [self.member.pk],
                "subject": "Spam",
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)

    def test_empty_user_ids_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"user_ids": [], "subject": "x", "body": "x"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_empty_subject_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {"user_ids": [self.member.pk], "subject": "  ", "body": "x"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_empty_body_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {
                "user_ids": [self.member.pk],
                "subject": "x",
                "body": "   ",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_too_many_recipients_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url,
            {
                "user_ids": list(range(1, 250)),  # 249 > 200 cap
                "subject": "x",
                "body": "x",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_anon_blocked(self) -> None:
        r = self.client.post(
            self.url,
            {"user_ids": [1], "subject": "x", "body": "x"},
            format="json",
        )
        self.assertIn(r.status_code, (401, 403))


class PaymentsReconcileTests(TestCase):
    """`POST /api/workspaces/<ws>/payments/reconcile/` — Fio CSV
    upload, owner-only. payments_reconcile.py má vlastní unit tests
    (tests_payments.py), tady jen endpoint scope: auth + file upload
    + format detection."""

    def setUp(self) -> None:
        self.owner = _make_user("o@pr.com")
        self.outsider = _make_user("x@pr.com")
        self.ws = Workspace.objects.create(slug="prws", name="PR")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.client = APIClient()
        self.url = reverse(
            "workspaces:payments-reconcile",
            kwargs={"slug": self.ws.slug},
        )

    def _csv_payload(self) -> bytes:
        return (
            '"Účet";"123/0800"\n'
            "\n"
            "Datum;Objem;VS;Zpráva pro příjemce\n"
            "01.05.2026;1000,00;42;Test platba\n"
        ).encode()

    def test_owner_uploads_csv(self) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(self.owner)
        f = SimpleUploadedFile(
            "fio.csv", self._csv_payload(), content_type="text/csv"
        )
        r = self.client.post(self.url, {"file": f}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        # No matching RSVP for VS=42 → unmatched bucket.
        self.assertEqual(data.get("credits"), 1)
        self.assertEqual(len(data.get("unmatched", [])), 1)

    def test_outsider_blocked(self) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(self.outsider)
        f = SimpleUploadedFile(
            "fio.csv", self._csv_payload(), content_type="text/csv"
        )
        r = self.client.post(self.url, {"file": f}, format="multipart")
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        f = SimpleUploadedFile(
            "fio.csv", self._csv_payload(), content_type="text/csv"
        )
        r = self.client.post(self.url, {"file": f}, format="multipart")
        self.assertIn(r.status_code, (401, 403))

    def test_missing_file_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(r.status_code, 400)
