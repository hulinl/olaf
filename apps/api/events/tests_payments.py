"""Payment + reconciliation coverage.

Both `events.payments` (SPAYD / QR string assembly) and
`events.payments_reconcile` (Fio CSV import) were unit-test-free up
until now. They're hot paths every camp will trip — the manual
payment flow lives or dies on these being correct, so cover them
properly.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event
from .payments import (
    _format_amount,
    _sanitize_msg,
    build_qr_png,
    build_spayd_string,
    next_variable_symbol,
)
from .payments_reconcile import (
    _parse_date,
    _parse_decimal,
    parse_fio_csv,
    reconcile_workspace,
)


class SpaydHelpersTests(TestCase):
    def test_format_amount_always_two_decimal_places(self) -> None:
        self.assertEqual(_format_amount(Decimal("2500")), "2500.00")
        self.assertEqual(_format_amount(Decimal("2500.5")), "2500.50")
        self.assertEqual(_format_amount(Decimal("2500.999")), "2501.00")

    def test_sanitize_msg_strips_disallowed_chars_and_clips(self) -> None:
        # `*` is the SPAYD field delimiter, and CR/LF are obvious breakers.
        self.assertEqual(
            _sanitize_msg("foo * bar\nbaz\rqux"),
            "foo  barbazqux",
        )
        long = "x" * 100
        self.assertEqual(len(_sanitize_msg(long)), 60)

    def test_sanitize_msg_handles_empty(self) -> None:
        self.assertEqual(_sanitize_msg(""), "")
        self.assertEqual(_sanitize_msg("   "), "")


class BuildSpaydStringTests(TestCase):
    def test_minimal_required_fields(self) -> None:
        s = build_spayd_string(iban="CZ6508000000192000145399", amount="2500")
        # Header + ACC + AM + CC.
        self.assertTrue(s.startswith("SPD*1.0*ACC:CZ6508000000192000145399"))
        self.assertIn("*AM:2500.00", s)
        self.assertIn("*CC:CZK", s)
        # No VS or MSG when not provided.
        self.assertNotIn("X-VS:", s)
        self.assertNotIn("MSG:", s)

    def test_full_payload(self) -> None:
        s = build_spayd_string(
            iban="CZ65 0800 0000 1920 0014 5399",  # spaces tolerated
            amount=Decimal("3499.50"),
            currency="czk",
            variable_symbol="20240001",
            message="Letní kemp",
        )
        # Spaces stripped from IBAN.
        self.assertIn("ACC:CZ6508000000192000145399", s)
        self.assertIn("X-VS:20240001", s)
        self.assertIn("MSG:Letní kemp", s)
        # Currency normalised upper-case.
        self.assertIn("CC:CZK", s)

    def test_message_with_asterisk_is_stripped(self) -> None:
        # `*` in MSG would break the SPAYD format — the sanitizer must
        # silently drop it so the resulting field never contains a
        # mid-string asterisk.
        s = build_spayd_string(
            iban="CZ65",
            amount="100",
            message="foo*bar",
        )
        # MSG should appear once, but without the inner `*`.
        msg_part = s.split("*MSG:")[1]
        self.assertNotIn("*", msg_part)


class BuildQrPngTests(TestCase):
    def test_returns_non_empty_png(self) -> None:
        spayd = "SPD*1.0*ACC:CZ65*AM:1000.00*CC:CZK"
        png = build_qr_png(spayd)
        self.assertIsInstance(png, bytes)
        self.assertTrue(len(png) > 100)
        # PNG magic bytes.
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")


class NextVariableSymbolTests(TestCase):
    def test_packs_event_and_rsvp_ids_when_small(self) -> None:
        self.assertEqual(next_variable_symbol(rsvp_id=42, event_id=7), "0007000042")

    def test_packed_format_is_10_digits(self) -> None:
        vs = next_variable_symbol(rsvp_id=999_999, event_id=9_999)
        self.assertEqual(len(vs), 10)
        self.assertTrue(vs.isdigit())

    def test_falls_back_when_event_id_too_large(self) -> None:
        # event_id >= 10_000 → fallback uses only rsvp_id zero-padded.
        vs = next_variable_symbol(rsvp_id=42, event_id=10_001)
        self.assertEqual(vs, "0000000042")

    def test_falls_back_when_rsvp_id_too_large(self) -> None:
        vs = next_variable_symbol(rsvp_id=1_500_000, event_id=5)
        self.assertEqual(len(vs), 10)


class FioCsvParseHelpersTests(TestCase):
    def test_parse_decimal_handles_czech_format(self) -> None:
        self.assertEqual(_parse_decimal("2 500,50"), Decimal("2500.50"))
        # NBSP as thousands separator (Fio sometimes emits this).
        self.assertEqual(_parse_decimal("2\xa0500,50"), Decimal("2500.50"))
        # Plain dot-form passes through.
        self.assertEqual(_parse_decimal("100.25"), Decimal("100.25"))

    def test_parse_decimal_rejects_garbage(self) -> None:
        self.assertIsNone(_parse_decimal(""))
        self.assertIsNone(_parse_decimal("foo"))

    def test_parse_date_handles_both_locale_forms(self) -> None:
        self.assertEqual(_parse_date("15.05.2026"), date(2026, 5, 15))
        self.assertEqual(_parse_date("2026-05-15"), date(2026, 5, 15))

    def test_parse_date_rejects_garbage(self) -> None:
        self.assertIsNone(_parse_date("not a date"))
        self.assertIsNone(_parse_date(""))


def _fio_csv(rows: list[dict[str, str]]) -> str:
    """Build a minimal Fio-style CSV with preamble + header + rows.
    Header uses the modern column names with Czech labels."""
    preamble = (
        '"Účet";"123/0800"\n'
        '"Datum stažení";"2026-05-20"\n'
        "\n"
    )
    header = "Datum;Objem;VS;Zpráva pro příjemce;Protiúčet\n"
    body = "".join(
        f'{r.get("datum","")};{r.get("objem","")};{r.get("vs","")};'
        f'{r.get("msg","")};{r.get("counterparty","")}\n'
        for r in rows
    )
    return preamble + header + body


class ParseFioCsvTests(TestCase):
    def test_skips_preamble_and_returns_credits_only(self) -> None:
        csv_text = _fio_csv(
            [
                {"datum": "15.05.2026", "objem": "2500,00", "vs": "100", "msg": "OK"},
                # Debit — must be filtered out.
                {"datum": "16.05.2026", "objem": "-200,00", "vs": "999"},
                # Zero amount — filtered out.
                {"datum": "17.05.2026", "objem": "0,00", "vs": "888"},
            ]
        )
        txns = parse_fio_csv(csv_text)
        self.assertEqual(len(txns), 1)
        self.assertEqual(txns[0].amount, Decimal("2500.00"))
        self.assertEqual(txns[0].variable_symbol, "100")

    def test_strips_leading_zeros_from_vs(self) -> None:
        csv_text = _fio_csv(
            [{"datum": "15.05.2026", "objem": "100,00", "vs": "0000123"}]
        )
        self.assertEqual(parse_fio_csv(csv_text)[0].variable_symbol, "123")

    def test_handles_bytes_with_utf8_bom(self) -> None:
        csv_text = _fio_csv(
            [{"datum": "15.05.2026", "objem": "100,00", "vs": "1"}]
        )
        as_bytes = ("﻿" + csv_text).encode("utf-8")
        txns = parse_fio_csv(as_bytes)
        self.assertEqual(len(txns), 1)

    def test_returns_empty_when_no_header(self) -> None:
        self.assertEqual(parse_fio_csv("just garbage"), [])


class ReconcileWorkspaceTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="recon@p.com",
            password="x",
            first_name="O",
            last_name="O",
            email_verified=True,
        )
        self.ws = Workspace.objects.create(slug="reconws", name="Recon")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        starts = timezone.now() + timedelta(days=10)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="recon-ev",
            title="Recon Camp",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
            price_amount=Decimal("2500.00"),
            price_currency="CZK",
        )
        self.participant = User.objects.create_user(
            email="part@p.com",
            password="x",
            first_name="P",
            last_name="P",
            email_verified=True,
        )

    def _create_pending_rsvp(self, vs: str, due: Decimal) -> RSVP:
        rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=due,
            payment_currency="CZK",
            variable_symbol=vs,
        )
        return rsvp

    def _csv_credit(self, vs: str, amount: str) -> str:
        return _fio_csv(
            [{"datum": "15.05.2026", "objem": amount, "vs": vs}]
        )

    def test_matches_vs_marks_paid_and_creates_invoice(self) -> None:
        rsvp = self._create_pending_rsvp("12345", Decimal("2500.00"))
        result = reconcile_workspace(
            workspace=self.ws,
            csv_content=self._csv_credit("12345", "2500,00"),
        )
        self.assertEqual(len(result.matched), 1)
        rsvp.refresh_from_db()
        self.assertEqual(rsvp.payment_status, RSVP.PAYMENT_PAID)
        self.assertIsNotNone(rsvp.paid_at)
        # Invoice auto-generated via generate_invoice_for_rsvp.
        self.assertTrue(hasattr(rsvp, "invoice"))

    def test_already_paid_lands_in_already_paid_bucket(self) -> None:
        rsvp = self._create_pending_rsvp("22222", Decimal("2500.00"))
        rsvp.payment_status = RSVP.PAYMENT_PAID
        rsvp.paid_at = timezone.now()
        rsvp.save(update_fields=["payment_status", "paid_at"])

        result = reconcile_workspace(
            workspace=self.ws,
            csv_content=self._csv_credit("22222", "2500,00"),
        )
        self.assertEqual(len(result.matched), 0)
        self.assertEqual(len(result.already_paid), 1)

    def test_unknown_vs_lands_in_unmatched(self) -> None:
        result = reconcile_workspace(
            workspace=self.ws,
            csv_content=self._csv_credit("99999", "2500,00"),
        )
        self.assertEqual(len(result.unmatched), 1)
        self.assertEqual(result.unmatched[0].variable_symbol, "99999")

    def test_amount_mismatch_flag_set(self) -> None:
        self._create_pending_rsvp("33333", Decimal("2500.00"))
        result = reconcile_workspace(
            workspace=self.ws,
            csv_content=self._csv_credit("33333", "2400,00"),
        )
        self.assertEqual(len(result.matched), 1)
        self.assertTrue(result.matched[0].amount_mismatch)

    def test_empty_vs_lands_in_unmatched(self) -> None:
        result = reconcile_workspace(
            workspace=self.ws,
            csv_content=self._csv_credit("", "500,00"),
        )
        self.assertEqual(len(result.unmatched), 1)
        self.assertEqual(result.unmatched[0].variable_symbol, "")

    def test_rsvp_in_other_workspace_does_not_match(self) -> None:
        # Same VS but on an event in a different workspace must NOT
        # match — reconciliation is tenant-scoped.
        other_ws = Workspace.objects.create(slug="otherws", name="Other")
        WorkspaceMember.objects.create(
            workspace=other_ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        other_event = Event.objects.create(
            workspace=other_ws,
            slug="other-ev",
            title="O",
            starts_at=self.event.starts_at,
            ends_at=self.event.ends_at,
            status=Event.STATUS_PUBLISHED,
            price_amount=Decimal("100.00"),
        )
        RSVP.objects.create(
            event=other_event,
            user=self.participant,
            status=RSVP.STATUS_YES,
            payment_status=RSVP.PAYMENT_PENDING,
            payment_due_amount=Decimal("100.00"),
            variable_symbol="44444",
        )
        result = reconcile_workspace(
            workspace=self.ws,
            csv_content=self._csv_credit("44444", "100,00"),
        )
        self.assertEqual(len(result.matched), 0)
        self.assertEqual(len(result.unmatched), 1)

    def test_counts_and_totals(self) -> None:
        self._create_pending_rsvp("55555", Decimal("2500.00"))
        csv_text = _fio_csv(
            [
                {"datum": "1.5.2026", "objem": "2500,00", "vs": "55555"},
                {"datum": "2.5.2026", "objem": "100,00", "vs": ""},
            ]
        )
        result = reconcile_workspace(
            workspace=self.ws, csv_content=csv_text
        )
        self.assertEqual(result.total_rows, 2)
        self.assertEqual(result.credits, 2)
        self.assertEqual(len(result.matched), 1)
        self.assertEqual(len(result.unmatched), 1)
