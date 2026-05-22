"""Payment endpoint coverage — participant payment view + owner
mark-as-paid action.

`tests_payments.py` testuje helpery (SPAYD, parser, reconciler).
Tady jdou endpointy: participant's payment panel + owner manual
mark-as-paid.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_paid_workspace_and_event(owner: User, slug: str = "ws") -> Event:
    ws = Workspace.objects.create(
        slug=slug,
        name=slug.title(),
        payment_iban="CZ65 0800 0000 1920 0014 5399",
        payment_bank_name="ČSOB",
        payment_due_days=14,
    )
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=f"{slug}-ev",
        title=f"E {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
        price_amount=Decimal("2500.00"),
        price_currency="CZK",
    )


class MyRsvpPaymentTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@pay.com")
        self.participant = _make_user("p@pay.com")
        self.event = _make_paid_workspace_and_event(self.owner, slug="payws")
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("2500.00"),
            payment_currency="CZK",
            variable_symbol="99999",
        )
        self.client = APIClient()
        self.url = reverse(
            "events:rsvp-payment",
            kwargs={
                "workspace_slug": self.event.workspace.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_participant_sees_payment_panel(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["amount"], "2500.00")
        self.assertEqual(data["currency"], "CZK")
        self.assertEqual(data["variable_symbol"], "99999")
        self.assertEqual(data["status"], "pending")
        # IBAN přepošlé bez modifikace.
        self.assertIn("CZ65", data["iban"])
        self.assertEqual(data["bank_name"], "ČSOB")
        self.assertEqual(data["due_days"], 14)
        # QR URL existuje (workspace má IBAN).
        self.assertIsNotNone(data["qr_png_url"])
        # Message má workspace + event title.
        self.assertIn("payws", data["message"].lower())

    def test_free_event_returns_400(self) -> None:
        # Free event = žádná platba, endpoint vrátí 400.
        free_event = Event.objects.create(
            workspace=self.event.workspace,
            slug="free",
            title="Free",
            starts_at=self.event.starts_at,
            ends_at=self.event.ends_at,
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(
            event=free_event, user=self.participant, status=RSVP.STATUS_YES
        )
        self.client.force_authenticate(self.participant)
        r = self.client.get(
            reverse(
                "events:rsvp-payment",
                kwargs={
                    "workspace_slug": free_event.workspace.slug,
                    "event_slug": free_event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 400)

    def test_user_without_rsvp_404(self) -> None:
        no_rsvp = _make_user("nr@pay.com")
        self.client.force_authenticate(no_rsvp)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_qr_url_none_when_workspace_has_no_iban(self) -> None:
        # Vyřaď IBAN — QR URL by mělo být None (frontend neukáže QR
        # kód, jen text instrukce).
        self.event.workspace.payment_iban = ""
        self.event.workspace.save(update_fields=["payment_iban"])
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertIsNone(r.json()["qr_png_url"])


class MyRsvpPaymentQrTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@qr.com")
        self.participant = _make_user("p@qr.com")
        self.event = _make_paid_workspace_and_event(self.owner, slug="qrws")
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_due_amount=Decimal("1000.00"),
            payment_currency="CZK",
            variable_symbol="11111",
        )
        self.client = APIClient()
        self.url = reverse(
            "events:rsvp-payment-qr",
            kwargs={
                "workspace_slug": self.event.workspace.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_participant_gets_qr_png(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "image/png")
        # PNG magic bytes.
        self.assertEqual(r.content[:8], b"\x89PNG\r\n\x1a\n")
        # Cache-Control private + short max-age.
        self.assertIn("private", r["Cache-Control"])

    def test_no_iban_404(self) -> None:
        self.event.workspace.payment_iban = ""
        self.event.workspace.save(update_fields=["payment_iban"])
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_free_event_404(self) -> None:
        self.event.price_amount = None
        self.event.save(update_fields=["price_amount"])
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_user_without_rsvp_404(self) -> None:
        no_rsvp = _make_user("nr@qr.com")
        self.client.force_authenticate(no_rsvp)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)


class MarkRsvpPaidTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@mp.com")
        self.participant = _make_user("p@mp.com")
        self.outsider = _make_user("x@mp.com")
        self.event = _make_paid_workspace_and_event(self.owner, slug="mpws")
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("2500.00"),
            variable_symbol="44444",
        )
        self.client = APIClient()
        self.url = reverse(
            "events:rsvp-mark-paid",
            kwargs={
                "workspace_slug": self.event.workspace.slug,
                "event_slug": self.event.slug,
                "rsvp_id": self.rsvp.pk,
            },
        )

    def test_owner_marks_rsvp_paid(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200, r.content)
        self.rsvp.refresh_from_db()
        self.assertEqual(self.rsvp.payment_status, "paid")
        self.assertIsNotNone(self.rsvp.paid_at)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 403)
        self.rsvp.refresh_from_db()
        self.assertEqual(self.rsvp.payment_status, "pending")

    def test_participant_cannot_mark_self_paid(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 403)

    def test_unknown_rsvp_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            reverse(
                "events:rsvp-mark-paid",
                kwargs={
                    "workspace_slug": self.event.workspace.slug,
                    "event_slug": self.event.slug,
                    "rsvp_id": 99999,
                },
            )
        )
        self.assertEqual(r.status_code, 404)

    def test_anon_blocked(self) -> None:
        r = self.client.post(self.url)
        self.assertIn(r.status_code, (401, 403))
