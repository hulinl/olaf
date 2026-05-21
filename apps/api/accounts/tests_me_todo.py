"""Dashboard `me/todo/` feed coverage.

The endpoint had zero tests until now. It powers the "Čeká na tebe"
card on /dashboard so a regression here is immediately visible to
participants — exactly the kind of surface to lock down.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import RSVP, Event, RSVPDocument
from workspaces.models import Workspace, WorkspaceMember

from .models import User


def _make_user(email: str = "u@t.com") -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(
        slug=slug, name=slug.title(), payment_iban="CZ65"
    )
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, **overrides) -> Event:
    starts = overrides.pop("starts_at", timezone.now() + timedelta(days=14))
    defaults = {
        "slug": "ev",
        "title": "Camp",
        "starts_at": starts,
        "ends_at": overrides.pop("ends_at", starts + timedelta(hours=4)),
        "status": Event.STATUS_PUBLISHED,
        "location_text": "Beskydy",
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=ws, **defaults)


class MeTodoBaseTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@t.com")
        self.me = _make_user("me@t.com")
        self.ws = _make_workspace(self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.url = reverse("accounts:me-todo")

    def test_no_rsvps_returns_empty_list(self) -> None:
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_anon_blocked(self) -> None:
        client = APIClient()
        r = client.get(self.url)
        self.assertIn(r.status_code, (401, 403))


class MeTodoPaymentTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@p.com")
        self.me = _make_user("me@p.com")
        self.ws = _make_workspace(self.owner, slug="payws")
        self.event = _make_event(self.ws, slug="payev")
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.url = reverse("accounts:me-todo")

    def test_pending_payment_surfaces(self) -> None:
        RSVP.objects.create(
            event=self.event,
            user=self.me,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("2500.00"),
            payment_currency="CZK",
            variable_symbol="20240001",
        )
        body = self.client.get(self.url).json()
        self.assertEqual(len(body), 1)
        item = body[0]
        self.assertEqual(item["kind"], "payment")
        self.assertEqual(item["amount"], "2500.00")
        self.assertEqual(item["currency"], "CZK")
        self.assertEqual(item["variable_symbol"], "20240001")
        self.assertEqual(item["workspace_slug"], self.ws.slug)
        self.assertEqual(item["event_slug"], self.event.slug)
        self.assertEqual(item["iban"], "CZ65")

    def test_paid_rsvp_does_not_surface(self) -> None:
        RSVP.objects.create(
            event=self.event,
            user=self.me,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PAID,
            payment_due_amount=Decimal("2500.00"),
            paid_at=timezone.now(),
        )
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_payment_with_no_due_amount_skipped(self) -> None:
        # Free events have payment_due_amount=None — even if status is
        # somehow PENDING, no QR can be generated, so don't dangle a
        # todo without a target.
        RSVP.objects.create(
            event=self.event,
            user=self.me,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=None,
        )
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_cancelled_rsvp_excluded(self) -> None:
        RSVP.objects.create(
            event=self.event,
            user=self.me,
            status=RSVP.STATUS_CANCELLED,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("2500.00"),
        )
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_no_status_rsvp_excluded(self) -> None:
        # STATUS_NO (declined) shouldn't drag pending payments back.
        RSVP.objects.create(
            event=self.event,
            user=self.me,
            status=RSVP.STATUS_NO,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("100.00"),
        )
        self.assertEqual(self.client.get(self.url).json(), [])


class MeTodoDocumentTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@d.com")
        self.me = _make_user("me@d.com")
        self.ws = _make_workspace(self.owner, slug="docws")
        # Three documents: liability is required, hike-pass too,
        # extra-photo is optional (required=False).
        self.event = _make_event(
            self.ws,
            slug="docev",
            required_documents=[
                {"key": "liability", "label": "Souhlas s odpovědností", "required": True},
                {"key": "hike-pass", "label": "Horský průkaz", "required": True},
                {"key": "extra-photo", "label": "Bonus foto", "required": False},
            ],
        )
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.me,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.url = reverse("accounts:me-todo")

    def test_all_required_docs_missing_returns_one_per_doc(self) -> None:
        items = self.client.get(self.url).json()
        kinds = [i["kind"] for i in items]
        self.assertEqual(kinds, ["document", "document"])
        labels = sorted(i["doc_label"] for i in items)
        # Optional doc must NOT appear.
        self.assertEqual(labels, ["Horský průkaz", "Souhlas s odpovědností"])

    def test_uploaded_doc_drops_off(self) -> None:
        RSVPDocument.objects.create(
            rsvp=self.rsvp, key="liability", file="x.pdf"
        )
        items = self.client.get(self.url).json()
        keys = [i["doc_key"] for i in items]
        # liability gone, hike-pass still pending.
        self.assertEqual(keys, ["hike-pass"])

    def test_optional_doc_never_shows(self) -> None:
        # Even before any upload, an optional doc shouldn't be in the
        # todo. Sanity-check by ensuring it's never returned regardless
        # of upload state.
        items = self.client.get(self.url).json()
        self.assertNotIn("extra-photo", [i["doc_key"] for i in items])

    def test_doc_with_missing_key_silently_skipped(self) -> None:
        # Defensive: a misconfigured doc spec ({} or {"required": True}
        # without a key) shouldn't break the dashboard.
        self.event.required_documents = [
            {"label": "Cosi", "required": True},  # no key → silent skip
            {"key": "valid", "label": "OK", "required": True},
        ]
        self.event.save(update_fields=["required_documents"])
        items = self.client.get(self.url).json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["doc_key"], "valid")


class MeTodoOrderingTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@o.com")
        self.me = _make_user("me@o.com")
        self.ws = _make_workspace(self.owner, slug="ordws")
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.url = reverse("accounts:me-todo")

    def test_payment_sorts_before_documents_for_same_event(self) -> None:
        event = _make_event(self.ws, slug="oe")
        event.required_documents = [
            {"key": "liability", "label": "Souhlas", "required": True},
        ]
        event.save(update_fields=["required_documents"])
        RSVP.objects.create(
            event=event,
            user=self.me,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("100.00"),
        )
        kinds = [i["kind"] for i in self.client.get(self.url).json()]
        self.assertEqual(kinds, ["payment", "document"])

    def test_earlier_event_sorts_first_within_same_kind(self) -> None:
        now = timezone.now()
        e_soon = _make_event(
            self.ws,
            slug="soon",
            starts_at=now + timedelta(days=7),
            ends_at=now + timedelta(days=7, hours=4),
        )
        e_later = _make_event(
            self.ws,
            slug="later",
            starts_at=now + timedelta(days=30),
            ends_at=now + timedelta(days=30, hours=4),
        )
        for event in (e_later, e_soon):
            RSVP.objects.create(
                event=event,
                user=self.me,
                status=RSVP.STATUS_YES,
                payment_status=RSVP.PAYMENT_PENDING,
                payment_due_amount=Decimal("100.00"),
            )
        items = self.client.get(self.url).json()
        # The sooner event lists first.
        self.assertEqual(items[0]["event_slug"], "soon")
        self.assertEqual(items[1]["event_slug"], "later")


class MeTodoMultiUserIsolationTests(TestCase):
    """The endpoint MUST scope to request.user — under no circumstances
    should one user's todos leak into another's feed."""

    def test_other_users_payment_does_not_leak(self) -> None:
        owner = _make_user("isoOwner@t.com")
        me = _make_user("iso-me@t.com")
        other = _make_user("iso-other@t.com")
        ws = _make_workspace(owner, slug="isows")
        event = _make_event(ws)
        # The OTHER user has a pending payment — me has nothing.
        RSVP.objects.create(
            event=event,
            user=other,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("100.00"),
        )
        client = APIClient()
        client.force_authenticate(me)
        self.assertEqual(client.get(reverse("accounts:me-todo")).json(), [])
