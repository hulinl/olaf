"""Roadmap task management — assignee, due_at, auto-reminder, my-tasks
dashboard, cash-payment checklist skip.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event, EventChecklistItem, EventCollaborator


def _u(email: str, first="X") -> User:
    return User.objects.create_user(
        email=email,
        password="tst-alpine-2026",
        first_name=first,
        last_name="Y",
        email_verified=True,
    )


def _ws(owner: User, slug: str = "tws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _ev(ws: Workspace, slug: str = "trip") -> Event:
    starts = timezone.now() + timedelta(days=30)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title="Trip",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


class TaskAssigneeAndDueTests(TestCase):
    def setUp(self) -> None:
        self.owner = _u("o@tm.com", first="Olaf")
        self.helper = _u("h@tm.com", first="Petr")
        self.ws = _ws(self.owner, slug="tmws")
        self.event = _ev(self.ws)

    def test_due_at_auto_derives_remind_at_24h_before(self) -> None:
        due = timezone.now() + timedelta(days=10)
        item = EventChecklistItem.objects.create(
            event=self.event,
            title="Zamluvit chatu",
            assignee=self.helper,
            due_at=due,
        )
        self.assertIsNotNone(item.remind_at)
        # 24h before due
        self.assertEqual(item.remind_at, due - timedelta(hours=24))
        # assignee audience auto-set
        self.assertEqual(
            item.remind_audience, EventChecklistItem.REMIND_AUDIENCE_ASSIGNEE
        )

    def test_explicit_remind_at_respected(self) -> None:
        due = timezone.now() + timedelta(days=10)
        remind = timezone.now() + timedelta(days=7)  # 3 days before due
        item = EventChecklistItem.objects.create(
            event=self.event,
            title="Něco",
            assignee=self.helper,
            due_at=due,
            remind_at=remind,
        )
        self.assertEqual(item.remind_at, remind)


class MyTasksDashboardTests(TestCase):
    def setUp(self) -> None:
        self.owner = _u("o@md.com", first="Olaf")
        self.helper = _u("h@md.com", first="Helena")
        self.other = _u("x@md.com", first="Cizí")
        self.ws = _ws(self.owner, slug="mdws")
        self.event = _ev(self.ws, slug="expedition")
        EventCollaborator.objects.create(
            event=self.event, user=self.helper, added_by=self.owner
        )
        # Owner-side úkol pro helpera
        self.assigned_to_helper = EventChecklistItem.objects.create(
            event=self.event,
            title="Zamluvit chatu",
            assignee=self.helper,
            due_at=timezone.now() + timedelta(days=5),
        )
        # Helper má úkol pro sebe
        self.self_assigned = EventChecklistItem.objects.create(
            event=self.event,
            title="Osobní úkol",
            assignee=self.helper,
            due_at=timezone.now() + timedelta(days=2),
        )
        # Úkol bez assignee — nikdo ho v „on_events_i_manage" neuvidí
        self.unassigned = EventChecklistItem.objects.create(
            event=self.event, title="Nezadaný"
        )
        # Done úkol se nezahrne
        self.done = EventChecklistItem.objects.create(
            event=self.event,
            title="Hotový",
            assignee=self.helper,
            done=True,
        )
        self.client = APIClient()
        self.url = reverse("events:my-tasks")

    def test_helper_sees_only_assigned_to_self(self) -> None:
        self.client.force_authenticate(self.helper)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        titles = [t["title"] for t in resp.data["assigned_to_me"]]
        self.assertEqual(
            sorted(titles), sorted(["Osobní úkol", "Zamluvit chatu"])
        )
        # Helper nemá owner-side view na akci
        self.assertEqual(resp.data["on_events_i_manage"], [])

    def test_owner_sees_others_tasks_on_events_they_manage(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.get(self.url)
        titles = [t["title"] for t in resp.data["on_events_i_manage"]]
        # 2 úkoly assigned k helperovi, unassigned ne, done ne
        self.assertEqual(len(titles), 2)
        self.assertNotIn("Nezadaný", titles)
        self.assertNotIn("Hotový", titles)

    def test_anon_gets_401(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 401)


class CashPaymentChecklistTests(TestCase):
    """Fakturační profil + IBAN se skryjí u placené akce s payment_in_cash=True."""

    def test_cash_event_hides_payment_bubbles(self) -> None:
        from decimal import Decimal

        from .checklist import auto_items_for_event

        owner = _u("o@cp.com")
        ws = _ws(owner, slug="cpws")
        # Cash-only event with a price
        starts = timezone.now() + timedelta(days=14)
        event = Event.objects.create(
            workspace=ws,
            slug="cash-trip",
            title="Trip",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
            price_amount=Decimal("500"),
            price_currency="CZK",
            payment_in_cash=True,
        )
        keys = [item.key for item in auto_items_for_event(event)]
        self.assertNotIn("payment_profile", keys)
        self.assertNotIn("payment_iban", keys)

    def test_bank_transfer_event_shows_payment_bubbles(self) -> None:
        from decimal import Decimal

        from .checklist import auto_items_for_event

        owner = _u("o@bt.com")
        ws = _ws(owner, slug="btws")
        starts = timezone.now() + timedelta(days=14)
        event = Event.objects.create(
            workspace=ws,
            slug="bank-trip",
            title="Trip",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
            price_amount=Decimal("500"),
            price_currency="CZK",
            payment_in_cash=False,
        )
        keys = [item.key for item in auto_items_for_event(event)]
        self.assertIn("payment_profile", keys)
        self.assertIn("payment_iban", keys)
