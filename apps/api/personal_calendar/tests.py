"""Personal calendar tests — Slice 5 vize „Časová osa" canvas."""
from __future__ import annotations

import datetime as dt
from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User

from .models import UserCalendarSource
from .services import _event_to_block, aggregate_busy_days, fetch_and_parse

SAMPLE_ICAL = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:evt-1@test
SUMMARY:Meeting s Petrem
DTSTART:20270115T100000Z
DTEND:20270115T110000Z
END:VEVENT
BEGIN:VEVENT
UID:evt-2@test
SUMMARY:Dovolena
DTSTART;VALUE=DATE:20270220
DTEND;VALUE=DATE:20270225
END:VEVENT
END:VCALENDAR
"""


def _mk_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="pass-abcdef-1234",
        first_name=email.split("@")[0].capitalize(),
        last_name="X",
        email_verified=True,
    )


class ICalParsingTests(TestCase):
    def test_parse_returns_list(self) -> None:
        with mock.patch(
            "personal_calendar.services.urllib.request.urlopen"
        ) as m:
            m.return_value.__enter__.return_value.read.return_value = (
                SAMPLE_ICAL
            )
            blocks = fetch_and_parse("https://example.com/cal.ics")
        self.assertIsInstance(blocks, list)

    def test_all_day_event_detection(self) -> None:
        import icalendar

        vev = icalendar.Event()
        vev.add("dtstart", dt.date(2027, 2, 20))
        vev.add("dtend", dt.date(2027, 2, 25))
        block = _event_to_block(vev)
        self.assertIsNotNone(block)
        self.assertTrue(block["all_day"])
        self.assertEqual(block["starts"], "2027-02-20")

    def test_timed_event_normalizes_to_utc(self) -> None:
        import icalendar

        vev = icalendar.Event()
        vev.add(
            "dtstart",
            dt.datetime(2027, 1, 15, 10, 0, tzinfo=dt.timezone.utc),
        )
        vev.add(
            "dtend",
            dt.datetime(2027, 1, 15, 11, 0, tzinfo=dt.timezone.utc),
        )
        block = _event_to_block(vev)
        self.assertFalse(block["all_day"])
        self.assertIn("+00:00", block["starts"])

    def test_fetch_network_error_raises(self) -> None:
        import urllib.error

        from .services import ICalFetchError

        with mock.patch(
            "personal_calendar.services.urllib.request.urlopen",
            side_effect=urllib.error.URLError("boom"),
        ):
            with self.assertRaises(ICalFetchError):
                fetch_and_parse("https://example.com/cal.ics")

    def test_privacy_no_summary_in_block(self) -> None:
        """PRIVACY GATE — block nesmí obsahovat summary / location /
        description. Backend ukládá jen typy times, žádný obsah."""
        import icalendar

        vev = icalendar.Event()
        vev.add(
            "dtstart",
            dt.datetime(2027, 1, 15, 10, 0, tzinfo=dt.timezone.utc),
        )
        vev.add(
            "dtend",
            dt.datetime(2027, 1, 15, 11, 0, tzinfo=dt.timezone.utc),
        )
        vev.add("summary", "Tajná schůzka")
        vev.add("location", "Prague")
        vev.add("description", "Detaily")
        block = _event_to_block(vev)
        self.assertNotIn("summary", block)
        self.assertNotIn("location", block)
        self.assertNotIn("description", block)


class BusyDaysAggregationTests(TestCase):
    def setUp(self) -> None:
        self.alice = _mk_user("alice@example.com")

    def test_empty_when_no_sources(self) -> None:
        days = aggregate_busy_days(
            self.alice,
            dt.date(2027, 1, 1),
            dt.date(2027, 12, 31),
        )
        self.assertEqual(days, {})

    def test_marks_single_day_busy(self) -> None:
        UserCalendarSource.objects.create(
            user=self.alice,
            name="Test",
            ical_url="https://example.com/x.ics",
            busy_blocks=[
                {
                    "starts": "2027-01-15T10:00:00+00:00",
                    "ends": "2027-01-15T11:00:00+00:00",
                    "all_day": False,
                }
            ],
        )
        days = aggregate_busy_days(
            self.alice, dt.date(2027, 1, 1), dt.date(2027, 1, 31)
        )
        self.assertEqual(list(days.keys()), ["2027-01-15"])

    def test_marks_multi_day_span_busy(self) -> None:
        UserCalendarSource.objects.create(
            user=self.alice,
            name="Test",
            ical_url="https://example.com/x.ics",
            busy_blocks=[
                {
                    "starts": "2027-02-20",
                    "ends": "2027-02-25",
                    "all_day": True,
                }
            ],
        )
        days = aggregate_busy_days(
            self.alice, dt.date(2027, 2, 1), dt.date(2027, 2, 28)
        )
        self.assertEqual(len(days), 6)
        self.assertIn("2027-02-20", days)
        self.assertIn("2027-02-25", days)

    def test_ignores_disabled_source(self) -> None:
        UserCalendarSource.objects.create(
            user=self.alice,
            name="Disabled",
            ical_url="https://example.com/x.ics",
            enabled=False,
            busy_blocks=[
                {
                    "starts": "2027-01-15T10:00:00+00:00",
                    "ends": "2027-01-15T11:00:00+00:00",
                    "all_day": False,
                }
            ],
        )
        days = aggregate_busy_days(
            self.alice, dt.date(2027, 1, 1), dt.date(2027, 1, 31)
        )
        self.assertEqual(days, {})

    def test_out_of_range_blocks_excluded(self) -> None:
        UserCalendarSource.objects.create(
            user=self.alice,
            name="Test",
            ical_url="https://example.com/x.ics",
            busy_blocks=[
                {
                    "starts": "2028-06-15T10:00:00+00:00",
                    "ends": "2028-06-15T11:00:00+00:00",
                    "all_day": False,
                }
            ],
        )
        days = aggregate_busy_days(
            self.alice, dt.date(2027, 1, 1), dt.date(2027, 12, 31)
        )
        self.assertEqual(days, {})


class SourcesAPITests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.alice = _mk_user("alice@example.com")
        self.bob = _mk_user("bob@example.com")

    def test_list_requires_auth(self) -> None:
        resp = self.client.get("/api/personal-calendar/sources/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_returns_only_own(self) -> None:
        UserCalendarSource.objects.create(
            user=self.alice, name="Alice cal", ical_url="https://a.example.com/x"
        )
        UserCalendarSource.objects.create(
            user=self.bob, name="Bob cal", ical_url="https://b.example.com/x"
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/personal-calendar/sources/")
        names = {s["name"] for s in resp.json()["sources"]}
        self.assertEqual(names, {"Alice cal"})

    @mock.patch(
        "personal_calendar.views.sync_source", return_value=(True, "ok")
    )
    def test_post_creates_source(self, mock_sync) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/personal-calendar/sources/",
            {
                "name": "Google",
                "ical_url": "https://calendar.google.com/x.ics",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            UserCalendarSource.objects.filter(user=self.alice).count(), 1
        )

    def test_post_rejects_invalid_url(self) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/personal-calendar/sources/",
            {"name": "X", "ical_url": "not-a-url"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_rejects_missing_fields(self) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            "/api/personal-calendar/sources/", {"name": "X"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_own_source(self) -> None:
        src = UserCalendarSource.objects.create(
            user=self.alice, name="X", ical_url="https://x.com/x.ics"
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.delete(f"/api/personal-calendar/sources/{src.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(UserCalendarSource.objects.count(), 0)

    def test_delete_others_source_404(self) -> None:
        src = UserCalendarSource.objects.create(
            user=self.bob, name="Bob", ical_url="https://x.com/x.ics"
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.delete(f"/api/personal-calendar/sources/{src.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_toggles_enabled(self) -> None:
        src = UserCalendarSource.objects.create(
            user=self.alice, name="X", ical_url="https://x.com/x.ics"
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.patch(
            f"/api/personal-calendar/sources/{src.pk}/",
            {"enabled": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        src.refresh_from_db()
        self.assertFalse(src.enabled)


class BusyDaysAPITests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.alice = _mk_user("alice@example.com")

    def test_requires_auth(self) -> None:
        resp = self.client.get("/api/personal-calendar/busy-days/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_busy_days_in_range(self) -> None:
        UserCalendarSource.objects.create(
            user=self.alice,
            name="X",
            ical_url="https://x.com/x.ics",
            busy_blocks=[
                {
                    "starts": "2027-05-10",
                    "ends": "2027-05-12",
                    "all_day": True,
                }
            ],
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get(
            "/api/personal-calendar/busy-days/",
            {"from": "2027-05-01", "to": "2027-05-31"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            set(resp.json()["busy_days"]),
            {"2027-05-10", "2027-05-11", "2027-05-12"},
        )

    def test_invalid_date_format_400(self) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.get(
            "/api/personal-calendar/busy-days/", {"from": "not-a-date"}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_to_before_from_400(self) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.get(
            "/api/personal-calendar/busy-days/",
            {"from": "2027-05-10", "to": "2027-05-01"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
