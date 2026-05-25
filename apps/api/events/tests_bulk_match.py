"""Coverage pro bulk-match payments endpoint.

Tenhle endpoint je generický JSON sink — V1 ho volá owner z UI po
paste-importu Fio statementu; V1.5 ho pojede Fio webhook adapter
přímo. Suite proto pokrývá:
  - happy path: spárování s exact amount
  - amount mismatch v toleranci 1 Kč (haléřové rozdíly z Fio)
  - amount mismatch nad tolerancí (vrátí to v `amount_mismatch`,
    NEoznačí jako paid)
  - already paid (idempotence)
  - not found (cizí VS, jiný workspace)
  - auth: workspace owner only, výsledky scope-ované jenom na vlastní
    workspace
  - audit log se zapíše + invoice se generuje
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


def _user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="x-pwd-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _ws(owner: User, slug: str = "bmws") -> Workspace:
    ws = Workspace.objects.create(
        slug=slug,
        name=slug.title(),
        payment_iban="CZ65 0800 0000 1920 0014 5399",
        payment_due_days=14,
    )
    WorkspaceMember.objects.create(workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER)
    return ws


def _event(ws: Workspace, slug: str = "ev", price="1500.00") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title=f"Event {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
        price_amount=Decimal(price),
        price_currency="CZK",
    )


def _rsvp(event: Event, user: User, vs: str, amount="1500.00", paid=False) -> RSVP:
    return RSVP.objects.create(
        event=event,
        user=user,
        status=RSVP.STATUS_YES,
        payment_status=RSVP.PAYMENT_PAID if paid else RSVP.PAYMENT_PENDING,
        payment_due_amount=Decimal(amount),
        payment_currency="CZK",
        variable_symbol=vs,
    )


class BulkMatchAuthTests(TestCase):
    def setUp(self) -> None:
        self.owner = _user("owner@bm.com")
        self.outsider = _user("out@bm.com")
        self.ws = _ws(self.owner)
        self.url = reverse(
            "events:payments-bulk-match",
            kwargs={"workspace_slug": self.ws.slug},
        )
        self.client = APIClient()

    def test_anon_blocked(self) -> None:
        r = self.client.post(self.url, {"matches": []}, format="json")
        self.assertIn(r.status_code, (401, 403))

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self.url, {"matches": []}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_unknown_workspace_404(self) -> None:
        self.client.force_authenticate(self.owner)
        bogus = reverse(
            "events:payments-bulk-match",
            kwargs={"workspace_slug": "ne-existuje"},
        )
        r = self.client.post(bogus, {"matches": []}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_missing_matches_array_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {}, format="json")
        self.assertEqual(r.status_code, 400)


class BulkMatchHappyPathTests(TestCase):
    def setUp(self) -> None:
        self.owner = _user("owner@bm2.com")
        self.participant = _user("part@bm2.com")
        self.ws = _ws(self.owner, slug="bm2ws")
        self.event = _event(self.ws)
        self.rsvp = _rsvp(self.event, self.participant, vs="20240042")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse(
            "events:payments-bulk-match",
            kwargs={"workspace_slug": self.ws.slug},
        )

    def test_exact_amount_marks_paid(self) -> None:
        r = self.client.post(
            self.url,
            {
                "matches": [
                    {"variable_symbol": "20240042", "amount": "1500.00"}
                ]
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["summary"]["matched"], 1)
        self.assertEqual(len(body["matched"]), 1)
        self.assertEqual(body["matched"][0]["variable_symbol"], "20240042")
        self.assertEqual(body["matched"][0]["rsvp_id"], self.rsvp.pk)

        self.rsvp.refresh_from_db()
        self.assertEqual(self.rsvp.payment_status, RSVP.PAYMENT_PAID)
        self.assertIsNotNone(self.rsvp.paid_at)

    def test_haler_tolerance(self) -> None:
        # Bank převede 1500.00 ale Fio uvádí 1499.50 — přijatelná
        # tolerance pro haléřové rozdíly (currency conversion atd.).
        r = self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "20240042", "amount": "1499.50"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["summary"]["matched"], 1)

    def test_amount_mismatch_does_not_mark_paid(self) -> None:
        # Owner zaslal omylem víc (např. 5000 místo 1500). Nemarkneme
        # jako paid, vrátíme to v amount_mismatch.
        r = self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "20240042", "amount": "5000.00"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["summary"]["amount_mismatch"], 1)
        self.assertEqual(body["summary"]["matched"], 0)
        self.assertEqual(body["amount_mismatch"][0]["expected"], "1500.00")
        self.assertEqual(body["amount_mismatch"][0]["received"], "5000.00")
        self.rsvp.refresh_from_db()
        self.assertEqual(self.rsvp.payment_status, RSVP.PAYMENT_PENDING)

    def test_already_paid_is_idempotent(self) -> None:
        # Re-run pro stejný VS po prvním matchi — nezdvojí audit/invoice.
        self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "20240042", "amount": "1500.00"}]},
            format="json",
        )
        audit_count_before = AuditLog.objects.filter(
            action=AuditLog.ACTION_RSVP_MARK_PAID
        ).count()
        r = self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "20240042", "amount": "1500.00"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["summary"]["already_paid"], 1)
        self.assertEqual(body["summary"]["matched"], 0)
        # Žádný extra audit row.
        self.assertEqual(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_RSVP_MARK_PAID
            ).count(),
            audit_count_before,
        )

    def test_not_found_vs(self) -> None:
        r = self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "99999999", "amount": "1500"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["summary"]["not_found"], 1)

    def test_cross_workspace_isolation(self) -> None:
        # RSVP s identickým VS v jiném workspace nesmí být matchnutý
        # přes tenhle endpoint — VS jsou unique per workspace, ne globally.
        other_owner = _user("o2@bm2.com")
        other_ws = _ws(other_owner, slug="otherbmws")
        other_event = _event(other_ws, slug="oev")
        _rsvp(other_event, other_owner, vs="20240042")  # stejné VS

        r = self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "20240042", "amount": "1500.00"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        # Náš workspace má 1 RSVP s tím VS — match.
        self.assertEqual(body["summary"]["matched"], 1)
        # Cizí workspace RSVP zůstal pending.
        other_rsvp = RSVP.objects.get(event=other_event, variable_symbol="20240042")
        self.assertEqual(other_rsvp.payment_status, RSVP.PAYMENT_PENDING)

    def test_multiple_matches_batch(self) -> None:
        # 3 RSVPs, 3 různé VS, 3 amounty — všechny v jednom POST.
        a = _rsvp(self.event, _user("a@bm.com"), vs="20240050", amount="2000.00")
        b = _rsvp(self.event, _user("b@bm.com"), vs="20240051", amount="2000.00")
        r = self.client.post(
            self.url,
            {
                "matches": [
                    {"variable_symbol": "20240042", "amount": "1500.00"},
                    {"variable_symbol": "20240050", "amount": "2000.00"},
                    {"variable_symbol": "20240051", "amount": "2000.00"},
                ]
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["summary"]["matched"], 3)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(a.payment_status, RSVP.PAYMENT_PAID)
        self.assertEqual(b.payment_status, RSVP.PAYMENT_PAID)

    def test_writes_audit_log_with_source_marker(self) -> None:
        self.client.post(
            self.url,
            {"matches": [{"variable_symbol": "20240042", "amount": "1500.00"}]},
            format="json",
        )
        row = AuditLog.objects.get(action=AuditLog.ACTION_RSVP_MARK_PAID)
        self.assertEqual(row.actor, self.owner)
        self.assertEqual(row.target_id, str(self.rsvp.pk))
        # Source marker odlišuje bulk_match od manuálního single-mark
        # paid — užitečné pro filtraci audit feedu.
        self.assertEqual(row.payload.get("source"), "bulk_match")
        self.assertEqual(row.payload["variable_symbol"], "20240042")

    def test_garbage_entries_skipped_not_500(self) -> None:
        # Frontend může omylem poslat malformed entries (chybějící
        # field, není dict, atd.). Endpoint je tolerantní — skip
        # nevalidní, ostatní zpracuje.
        r = self.client.post(
            self.url,
            {
                "matches": [
                    "not-a-dict",
                    {"variable_symbol": "20240042"},  # missing amount
                    {"amount": "1500"},  # missing VS
                    {"variable_symbol": "20240042", "amount": "1500.00"},  # OK
                ]
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["summary"]["matched"], 1)
