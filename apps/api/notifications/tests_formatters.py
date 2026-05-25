"""Coverage pro CZ-locale formattery — date strings v transactional e-mailech."""
from __future__ import annotations

from datetime import datetime, timezone

from django.test import TestCase

from .formatters import format_event_date, format_event_dt, format_payment_due


class FormatEventDtTests(TestCase):
    def test_basic(self) -> None:
        # 2026-05-22 14:00 = Friday
        dt = datetime(2026, 5, 22, 14, 0, tzinfo=timezone.utc)
        self.assertEqual(format_event_dt(dt), "pátek 22. 5. 2026 v 14:00")

    def test_zero_padded_minutes(self) -> None:
        dt = datetime(2026, 5, 22, 9, 5, tzinfo=timezone.utc)
        self.assertEqual(format_event_dt(dt), "pátek 22. 5. 2026 v 9:05")

    def test_none(self) -> None:
        self.assertEqual(format_event_dt(None), "")


class FormatEventDateTests(TestCase):
    def test_basic(self) -> None:
        dt = datetime(2026, 5, 22, 14, 0, tzinfo=timezone.utc)
        self.assertEqual(format_event_date(dt), "pátek 22. 5. 2026")

    def test_none(self) -> None:
        self.assertEqual(format_event_date(None), "")


class FormatPaymentDueTests(TestCase):
    def test_basic_14_days(self) -> None:
        # 2026-05-25 (pondělí) + 14 dní = 2026-06-08 (pondělí)
        created = datetime(2026, 5, 25, 10, 0, tzinfo=timezone.utc)
        self.assertEqual(format_payment_due(created, 14), "do pondělí 8. 6. 2026")

    def test_short_due(self) -> None:
        # 2026-05-25 + 3 dni = 2026-05-28 (čtvrtek)
        created = datetime(2026, 5, 25, 10, 0, tzinfo=timezone.utc)
        self.assertEqual(format_payment_due(created, 3), "do čtvrtek 28. 5. 2026")

    def test_zero_due_days_blank(self) -> None:
        # 0 = immediate / not applicable → fallback prázdný string
        created = datetime(2026, 5, 25, 10, 0, tzinfo=timezone.utc)
        self.assertEqual(format_payment_due(created, 0), "")

    def test_none_inputs(self) -> None:
        self.assertEqual(format_payment_due(None, 14), "")
        self.assertEqual(format_payment_due(datetime.now(timezone.utc), None), "")
