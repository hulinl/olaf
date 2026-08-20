"""Event costing — kalkulace nákladů, break-even, P&L dashboard.

Opt-in per akci; owner-gated; summary počítá plán vs skutečnost + marži.
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

from .models import RSVP, Event, EventCosting, EventCostItem


def _u(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="tst-alpine",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _ws(owner: User, slug: str = "cws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _ev(ws: Workspace, slug: str = "camp") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title="Camp",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
        price_amount=Decimal("1500"),
        price_currency="CZK",
    )


class CostingEndpointTests(TestCase):
    def setUp(self) -> None:
        self.owner = _u("o@ck.com")
        self.outsider = _u("x@ck.com")
        self.ws = _ws(self.owner, slug="ckws")
        self.event = _ev(self.ws, slug="kemp")
        self.client = APIClient()
        self.url = reverse(
            "events:event-costing", args=[self.ws.slug, self.event.slug]
        )

    def test_owner_gets_default_disabled(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["meta"]["enabled"])
        self.assertEqual(resp.data["items"], [])
        self.assertIn("summary", resp.data)

    def test_owner_enables_and_saves_meta(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.put(
            self.url,
            {
                "enabled": True,
                "expected_paying_count": 15,
                "margin_pct": "20",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["meta"]["enabled"])
        self.assertEqual(resp.data["meta"]["expected_paying_count"], 15)

    def test_outsider_gets_404(self) -> None:
        self.client.force_authenticate(self.outsider)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 404)

    def test_anon_gets_401(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 401)


class CostingItemsTests(TestCase):
    def setUp(self) -> None:
        self.owner = _u("o@ci.com")
        self.ws = _ws(self.owner, slug="ciws")
        self.event = _ev(self.ws, slug="expedice")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.items_url = reverse(
            "events:event-cost-items", args=[self.ws.slug, self.event.slug]
        )

    def test_create_item(self) -> None:
        resp = self.client.post(
            self.items_url,
            {
                "name": "Chata Bečva",
                "kind": "fixed",
                "planned_amount": "5000",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(EventCosting.objects.count(), 1)
        self.assertEqual(EventCostItem.objects.count(), 1)

    def test_update_and_delete(self) -> None:
        costing = EventCosting.objects.create(event=self.event)
        item = EventCostItem.objects.create(
            costing=costing,
            name="Doprava",
            kind="fixed",
            planned_amount=Decimal("2000"),
        )
        detail_url = reverse(
            "events:event-cost-item-detail",
            args=[self.ws.slug, self.event.slug, item.pk],
        )
        resp = self.client.patch(
            detail_url, {"actual_amount": "2200"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(EventCostItem.objects.get(pk=item.pk).actual_amount, Decimal("2200"))
        resp = self.client.delete(detail_url)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(EventCostItem.objects.filter(pk=item.pk).exists())


class CostingSummaryTests(TestCase):
    """Ekonomický výpočet — plán, skutečnost, break-even, marže, zisk."""

    def setUp(self) -> None:
        self.owner = _u("o@cs.com")
        self.ws = _ws(self.owner, slug="csws")
        self.event = _ev(self.ws, slug="beh-kemp")
        self.costing = EventCosting.objects.create(
            event=self.event,
            enabled=True,
            expected_paying_count=10,
            margin_pct=Decimal("20"),
        )
        # 3 nákladové řádky: fixed + per_person + extra po plánu (jen actual)
        EventCostItem.objects.create(
            costing=self.costing,
            name="Chata",
            kind="fixed",
            planned_amount=Decimal("5000"),
            actual_amount=Decimal("5000"),
        )
        EventCostItem.objects.create(
            costing=self.costing,
            name="Jídlo",
            kind="per_person",
            planned_amount=Decimal("400"),
            actual_amount=Decimal("500"),
        )
        EventCostItem.objects.create(
            costing=self.costing,
            name="Baterky extra",
            kind="fixed",
            planned_amount=None,
            actual_amount=Decimal("300"),
        )
        # 8 RSVP se statusem YES paid (non-organizer)
        for i in range(8):
            u = _u(f"p{i}@cs.com")
            RSVP.objects.create(
                event=self.event,
                user=u,
                status=RSVP.STATUS_YES,
                is_organizer=False,
                payment_status=RSVP.PAYMENT_PAID,
                payment_due_amount=Decimal("1500"),
            )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_summary_computes_expected_values(self) -> None:
        url = reverse(
            "events:event-costing", args=[self.ws.slug, self.event.slug]
        )
        resp = self.client.get(url)
        summary = resp.data["summary"]

        # Plán: 5000 (chata) + 400 x 10 (jídlo per 10 očekávaných) = 9000
        self.assertEqual(summary["plan_total"], "9000.00")
        # Skutečnost: 5000 (chata) + 500 x 8 (jídlo per 8 paid) + 300 (baterky) = 9300
        self.assertEqual(summary["actual_total"], "9300.00")
        # Break-even plán: 9000 / 10 = 900
        self.assertEqual(summary["break_even_per_person_plan"], "900.00")
        # Break-even skutečnost: 9300 / 8 = 1162.50
        self.assertEqual(summary["break_even_per_person_actual"], "1162.50")
        # Doporučená cena: 900 x 1.20 = 1080
        self.assertEqual(summary["suggested_price"], "1080.00")
        # Očekávané výnosy: 1500 x 10 = 15000
        self.assertEqual(summary["expected_revenue"], "15000.00")
        # Skutečné výnosy: 1500 x 8 = 12000
        self.assertEqual(summary["actual_revenue"], "12000.00")
        # Zisk plán: 15000 - 9000 = 6000
        self.assertEqual(summary["profit_plan"], "6000.00")
        # Zisk skutečnost: 12000 - 9300 = 2700
        self.assertEqual(summary["profit_actual"], "2700.00")
        # Counts
        self.assertEqual(summary["confirmed_count"], 8)
        self.assertEqual(summary["paid_count"], 8)


class CostingCsvTests(TestCase):
    def setUp(self) -> None:
        self.owner = _u("o@cc.com")
        self.ws = _ws(self.owner, slug="ccws")
        self.event = _ev(self.ws, slug="camp-csv")
        costing = EventCosting.objects.create(event=self.event)
        EventCostItem.objects.create(
            costing=costing,
            name="Chata",
            kind="fixed",
            planned_amount=Decimal("5000"),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_owner_downloads_csv(self) -> None:
        url = reverse(
            "events:event-costing-csv", args=[self.ws.slug, self.event.slug]
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("kalkulace-camp-csv.csv", resp["Content-Disposition"])
        body = resp.content.decode("utf-8")
        self.assertTrue(body.startswith("﻿"))
        self.assertIn("Chata", body)
