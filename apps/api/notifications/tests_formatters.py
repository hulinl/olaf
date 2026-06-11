"""Coverage pro CZ-locale formattery — date strings v transactional e-mailech."""
from __future__ import annotations

from datetime import UTC, datetime

from django.test import TestCase

from .formatters import format_event_date, format_event_dt, format_payment_due


class FormatEventDtTests(TestCase):
    def test_basic(self) -> None:
        # 2026-05-22 14:00 = Friday
        dt = datetime(2026, 5, 22, 14, 0, tzinfo=UTC)
        self.assertEqual(format_event_dt(dt), "pátek 22. 5. 2026 v 14:00")

    def test_zero_padded_minutes(self) -> None:
        dt = datetime(2026, 5, 22, 9, 5, tzinfo=UTC)
        self.assertEqual(format_event_dt(dt), "pátek 22. 5. 2026 v 9:05")

    def test_none(self) -> None:
        self.assertEqual(format_event_dt(None), "")

    def test_tz_conversion_from_utc_to_prague_summer(self) -> None:
        # `event.starts_at` ukládáme jako UTC. Akce začínající 18:00
        # v Praze v letním čase (CEST = UTC+2) je v DB jako 16:00 UTC.
        # User reportoval, že e-mail ukazoval 16:00 — formatter
        # nepřevedl. Bez `tz` arg: 16:00 (regrese). S `tz`: 18:00.
        dt = datetime(2026, 6, 11, 16, 0, tzinfo=UTC)
        self.assertEqual(
            format_event_dt(dt, "Europe/Prague"),
            "čtvrtek 11. 6. 2026 v 18:00",
        )

    def test_tz_conversion_handles_winter_offset(self) -> None:
        # Zimní čas — CET = UTC+1. 18:00 v Praze = 17:00 UTC.
        dt = datetime(2026, 1, 15, 17, 0, tzinfo=UTC)
        self.assertEqual(
            format_event_dt(dt, "Europe/Prague"),
            "čtvrtek 15. 1. 2026 v 18:00",
        )

    def test_unknown_tz_falls_back_silently(self) -> None:
        # Neznámou tz nehlasujeme do e-mailu — vrátíme čas v původní
        # zóně, do logu warning. Lepší než hodit chybu uživateli.
        dt = datetime(2026, 6, 11, 16, 0, tzinfo=UTC)
        result = format_event_dt(dt, "Mars/Olympus_Mons")
        self.assertIn("16:00", result)


class FormatEventDateTests(TestCase):
    def test_basic(self) -> None:
        dt = datetime(2026, 5, 22, 14, 0, tzinfo=UTC)
        self.assertEqual(format_event_date(dt), "pátek 22. 5. 2026")

    def test_none(self) -> None:
        self.assertEqual(format_event_date(None), "")

    def test_tz_conversion_can_shift_date(self) -> None:
        # 2026-06-11 23:30 UTC = 2026-06-12 01:30 Europe/Prague (CEST).
        # Den se ve výpisu posune — test brání regresi, kde formatter
        # tiše zahodí tz a den vyrenderuje "podle UTC".
        dt = datetime(2026, 6, 11, 23, 30, tzinfo=UTC)
        self.assertEqual(
            format_event_date(dt, "Europe/Prague"),
            "pátek 12. 6. 2026",
        )


class FormatPaymentDueTests(TestCase):
    def test_basic_14_days(self) -> None:
        # 2026-05-25 (pondělí) + 14 dní = 2026-06-08 (pondělí)
        created = datetime(2026, 5, 25, 10, 0, tzinfo=UTC)
        self.assertEqual(format_payment_due(created, 14), "do pondělí 8. 6. 2026")

    def test_short_due(self) -> None:
        # 2026-05-25 + 3 dni = 2026-05-28 (čtvrtek)
        created = datetime(2026, 5, 25, 10, 0, tzinfo=UTC)
        self.assertEqual(format_payment_due(created, 3), "do čtvrtek 28. 5. 2026")

    def test_zero_due_days_blank(self) -> None:
        # 0 = immediate / not applicable → fallback prázdný string
        created = datetime(2026, 5, 25, 10, 0, tzinfo=UTC)
        self.assertEqual(format_payment_due(created, 0), "")

    def test_none_inputs(self) -> None:
        self.assertEqual(format_payment_due(None, 14), "")
        self.assertEqual(format_payment_due(datetime.now(UTC), None), "")
