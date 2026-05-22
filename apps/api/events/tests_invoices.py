"""Invoice endpoint coverage.

Faktury jsou kritická plocha pro placené akce — owner je vidí v
cockpitu, účastník na své Faktura sub-tab. Bug tady = faktura
nedoletí, špatné údaje, špatný permissions.
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

from .models import (
    RSVP,
    Event,
    generate_invoice_for_rsvp,
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
    ws = Workspace.objects.create(
        slug=slug,
        name=slug.title(),
        payment_iban="CZ65 0800 0000 1920 0014 5399",
        payment_bank_name="ČSOB",
    )
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_paid_event(ws: Workspace, slug: str = "ev") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title=f"Event {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
        price_amount=Decimal("2500.00"),
        price_currency="CZK",
    )


class EventInvoicesListTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@inv.com")
        self.outsider = _make_user("x@inv.com")
        self.participant = _make_user("p@inv.com")
        self.ws = _make_workspace(self.owner, slug="invws")
        self.event = _make_paid_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PAID,
            payment_due_amount=Decimal("2500.00"),
            variable_symbol="12345",
        )
        self.invoice = generate_invoice_for_rsvp(self.rsvp)
        self.client = APIClient()
        self.url = reverse(
            "events:invoices",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_owner_lists_invoices(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.invoice.pk)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_unknown_event_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            reverse(
                "events:invoices",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": "neexistuje",
                },
            )
        )
        self.assertEqual(r.status_code, 404)


class InvoiceDetailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@id.com")
        self.outsider = _make_user("x@id.com")
        self.participant = _make_user("p@id.com")
        self.ws = _make_workspace(self.owner, slug="idws")
        self.event = _make_paid_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PAID,
            payment_due_amount=Decimal("2500.00"),
            variable_symbol="22222",
        )
        self.invoice = generate_invoice_for_rsvp(self.rsvp)
        self.client = APIClient()

    def _url(self, invoice_id: int | None = None) -> str:
        return reverse(
            "events:invoice-detail",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "invoice_id": invoice_id or self.invoice.pk,
            },
        )

    def test_owner_gets_invoice(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], self.invoice.pk)

    def test_owner_can_patch_invoice(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(),
            {"customer_name": "Updated Name"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.customer_name, "Updated Name")

    def test_participant_cannot_access_owner_endpoint(self) -> None:
        # invoice_detail je owner-only — účastník vidí jen svoji
        # přes my_invoice endpoint.
        self.client.force_authenticate(self.participant)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 403)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 403)

    def test_unknown_invoice_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(invoice_id=99999))
        self.assertEqual(r.status_code, 404)

    def test_cross_event_isolation(self) -> None:
        # Invoice z jiné akce + URL na naší akci → 404 (ne 200 kdyby
        # endpoint nefiltroval správně).
        other_event = _make_paid_event(self.ws, slug="other-event")
        other_rsvp = RSVP.objects.create(
            event=other_event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PAID,
            payment_due_amount=Decimal("100.00"),
            variable_symbol="33333",
        )
        other_invoice = generate_invoice_for_rsvp(other_rsvp)
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(invoice_id=other_invoice.pk))
        # invoice_id matches existing invoice ALE patří k jinému eventu.
        # URL cesta `events:invoice-detail` má event_slug v path, tedy
        # endpoint by měl 404nout.
        self.assertEqual(r.status_code, 404)


class MyInvoiceTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@mi.com")
        self.participant = _make_user("p@mi.com")
        self.other = _make_user("o2@mi.com")
        self.ws = _make_workspace(self.owner, slug="miws")
        self.event = _make_paid_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PAID,
            payment_due_amount=Decimal("2500.00"),
            variable_symbol="55555",
        )
        self.invoice = generate_invoice_for_rsvp(self.rsvp)
        self.client = APIClient()
        self.url = reverse(
            "events:my-invoice",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_participant_sees_own_invoice(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], self.invoice.pk)

    def test_other_user_without_rsvp_404(self) -> None:
        self.client.force_authenticate(self.other)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_rsvp_without_invoice_404(self) -> None:
        # RSVP existuje ale faktura ještě nevygenerovaná.
        no_inv_user = _make_user("ni@mi.com")
        RSVP.objects.create(
            event=self.event,
            user=no_inv_user,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("2500.00"),
            variable_symbol="66666",
        )
        self.client.force_authenticate(no_inv_user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 404)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))


class InvoicePdfQrTests(TestCase):
    """PDF + QR generation endpoints — smoke testy že returnujou
    non-empty bytes s correct content-type."""

    def setUp(self) -> None:
        self.owner = _make_user("o@pdf.com")
        self.participant = _make_user("p@pdf.com")
        self.outsider = _make_user("x@pdf.com")
        self.ws = _make_workspace(self.owner, slug="pdfws")
        self.event = _make_paid_event(self.ws)
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PAID,
            payment_due_amount=Decimal("2500.00"),
            variable_symbol="77777",
        )
        self.invoice = generate_invoice_for_rsvp(self.rsvp)
        self.client = APIClient()

    def _pdf_url(self) -> str:
        return reverse(
            "events:invoice-pdf",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "invoice_id": self.invoice.pk,
            },
        )

    def _qr_url(self) -> str:
        return reverse(
            "events:invoice-qr",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "invoice_id": self.invoice.pk,
            },
        )

    def test_owner_downloads_pdf(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._pdf_url())
        self.assertEqual(r.status_code, 200)
        self.assertIn("application/pdf", r["Content-Type"])
        # PDF magic bytes
        self.assertEqual(r.content[:4], b"%PDF")

    def test_participant_downloads_own_pdf(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.get(self._pdf_url())
        self.assertEqual(r.status_code, 200)

    def test_outsider_blocked_from_pdf(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._pdf_url())
        # Outsider bez RSVP a bez owner role → 403/404.
        self.assertIn(r.status_code, (403, 404))

    def test_qr_returns_png(self) -> None:
        # QR jen pokud invoice má required data (variable_symbol +
        # workspace IBAN). Náš setup oboje má.
        self.client.force_authenticate(self.participant)
        r = self.client.get(self._qr_url())
        self.assertEqual(r.status_code, 200)
        self.assertIn("image/png", r["Content-Type"])
        self.assertEqual(r.content[:8], b"\x89PNG\r\n\x1a\n")
