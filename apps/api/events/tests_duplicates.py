"""Duplicate-RSVP hint coverage.

The detector itself is pure-function (no DB), so most tests just
build a small in-memory list. One integration test checks that the
`event_rsvps` endpoint actually surfaces the hints.
"""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .duplicates import (
    HINT_SAME_NAME,
    HINT_SAME_PHONE,
    _normalize_name,
    _normalize_phone,
    detect_duplicates,
)
from .models import RSVP, Event


def _user_stub(uid: int, *, first="", last="", phone="") -> SimpleNamespace:
    """Pure stand-in for accounts.User — the detector only touches
    `.user.first_name`, `.user.last_name`, `.user.phone`, so we don't
    need a real DB row."""
    return SimpleNamespace(
        id=uid,
        first_name=first,
        last_name=last,
        phone=phone,
    )


def _rsvp_stub(rid: int, user) -> SimpleNamespace:
    return SimpleNamespace(id=rid, user=user, user_id=user.id)


class NormalizationTests(TestCase):
    def test_phone_strips_punctuation_and_country_code(self) -> None:
        # +420 spaced-out form should match the bare nine-digit form.
        self.assertEqual(
            _normalize_phone("+420 777 123 456"),
            _normalize_phone("777-123-456"),
        )

    def test_phone_preserves_short_local_numbers(self) -> None:
        # A non-Czech 9-digit number happens to match; we don't try
        # to enforce locale. But "420" prefix only strips when length
        # > 9 — so 420123456 stays as-is.
        self.assertEqual(_normalize_phone("420123456"), "420123456")

    def test_phone_blank_returns_empty(self) -> None:
        self.assertEqual(_normalize_phone(""), "")
        self.assertEqual(_normalize_phone(None or ""), "")

    def test_name_accent_fold_and_case(self) -> None:
        self.assertEqual(
            _normalize_name("Honza", "Dvořák"),
            _normalize_name("HONZA", "DVORAK"),
        )

    def test_name_collapses_whitespace(self) -> None:
        self.assertEqual(
            _normalize_name("  Jan  ", "  Novák  "),
            "jan novak",
        )

    def test_name_blank_returns_empty(self) -> None:
        self.assertEqual(_normalize_name("", ""), "")


class DetectDuplicatesTests(TestCase):
    def test_single_rsvp_no_hints(self) -> None:
        rsvps = [_rsvp_stub(1, _user_stub(1, first="Alice", last="A"))]
        self.assertEqual(detect_duplicates(rsvps), {})

    def test_same_phone_flags_both_rows(self) -> None:
        u1 = _user_stub(1, first="A", last="X", phone="+420 777 111 222")
        u2 = _user_stub(2, first="B", last="Y", phone="777111222")
        rsvps = [_rsvp_stub(10, u1), _rsvp_stub(11, u2)]
        result = detect_duplicates(rsvps)
        self.assertEqual(result[10], [HINT_SAME_PHONE])
        self.assertEqual(result[11], [HINT_SAME_PHONE])

    def test_same_name_diacritic_insensitive(self) -> None:
        u1 = _user_stub(1, first="Honza", last="Dvořák")
        u2 = _user_stub(2, first="honza", last="dvorak")
        rsvps = [_rsvp_stub(10, u1), _rsvp_stub(11, u2)]
        result = detect_duplicates(rsvps)
        self.assertEqual(result[10], [HINT_SAME_NAME])
        self.assertEqual(result[11], [HINT_SAME_NAME])

    def test_both_phone_and_name_match(self) -> None:
        u1 = _user_stub(1, first="A", last="A", phone="777111222")
        u2 = _user_stub(2, first="a", last="a", phone="777111222")
        rsvps = [_rsvp_stub(10, u1), _rsvp_stub(11, u2)]
        result = detect_duplicates(rsvps)
        self.assertEqual(result[10], [HINT_SAME_PHONE, HINT_SAME_NAME])
        self.assertEqual(result[11], [HINT_SAME_PHONE, HINT_SAME_NAME])

    def test_empty_phone_does_not_match_other_empty(self) -> None:
        # Two users without phones MUST NOT cross-match — false-positive
        # would be the worst kind of duplicate UX (everyone flagged).
        u1 = _user_stub(1, first="A", last="A", phone="")
        u2 = _user_stub(2, first="B", last="B", phone="")
        rsvps = [_rsvp_stub(10, u1), _rsvp_stub(11, u2)]
        result = detect_duplicates(rsvps)
        self.assertNotIn(10, result)
        self.assertNotIn(11, result)

    def test_skips_rsvp_without_user(self) -> None:
        rsvps = [
            SimpleNamespace(id=10, user=None, user_id=None),
            _rsvp_stub(
                11, _user_stub(1, first="A", last="A", phone="777")
            ),
        ]
        result = detect_duplicates(rsvps)
        self.assertEqual(result, {})

    def test_three_way_phone_match_all_flagged(self) -> None:
        u1 = _user_stub(1, first="A", last="A", phone="777111222")
        u2 = _user_stub(2, first="B", last="B", phone="+420 777 111 222")
        u3 = _user_stub(3, first="C", last="C", phone="777111222")
        rsvps = [
            _rsvp_stub(i, u)
            for i, u in zip([10, 11, 12], [u1, u2, u3], strict=True)
        ]
        result = detect_duplicates(rsvps)
        for rid in (10, 11, 12):
            self.assertEqual(result[rid], [HINT_SAME_PHONE])

    def test_hint_order_is_stable(self) -> None:
        # phone first, name second — phone is the stronger signal.
        u1 = _user_stub(1, first="A", last="A", phone="777111222")
        u2 = _user_stub(2, first="a", last="a", phone="777111222")
        rsvps = [_rsvp_stub(10, u1), _rsvp_stub(11, u2)]
        self.assertEqual(
            detect_duplicates(rsvps)[10],
            [HINT_SAME_PHONE, HINT_SAME_NAME],
        )


class EventRsvpsEndpointDuplicateTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="owner@d.com",
            password="alpine-hike-2026",
            first_name="O",
            last_name="O",
            email_verified=True,
        )
        self.ws = Workspace.objects.create(slug="dupws", name="DupWS")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        starts = timezone.now() + timedelta(days=10)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="dup-ev",
            title="Dup",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        # Three RSVPed users — A & B share the phone; C is alone.
        self.user_a = User.objects.create_user(
            email="a@d.com",
            password="x",
            first_name="Alice",
            last_name="A",
            phone="+420 777 111 222",
            email_verified=True,
        )
        self.user_b = User.objects.create_user(
            email="b@d.com",
            password="x",
            first_name="Bob",
            last_name="B",
            phone="777111222",
            email_verified=True,
        )
        self.user_c = User.objects.create_user(
            email="c@d.com",
            password="x",
            first_name="Carol",
            last_name="C",
            email_verified=True,
        )
        for u in (self.user_a, self.user_b, self.user_c):
            RSVP.objects.create(event=self.event, user=u, status=RSVP.STATUS_YES)

    def test_endpoint_returns_hints_for_duplicates(self) -> None:
        client = APIClient()
        client.force_authenticate(self.owner)
        url = reverse(
            "events:rsvps",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        r = client.get(url)
        self.assertEqual(r.status_code, 200)
        by_email = {row["user_email"]: row for row in r.json()}
        self.assertEqual(
            by_email["a@d.com"]["duplicate_hints"], [HINT_SAME_PHONE]
        )
        self.assertEqual(
            by_email["b@d.com"]["duplicate_hints"], [HINT_SAME_PHONE]
        )
        self.assertEqual(by_email["c@d.com"]["duplicate_hints"], [])

    def test_cancelled_rsvp_is_excluded_from_check(self) -> None:
        # If user A cancels, B shouldn't be flagged anymore (the only
        # other phone match is now out of scope).
        RSVP.objects.filter(event=self.event, user=self.user_a).update(
            status=RSVP.STATUS_CANCELLED
        )
        client = APIClient()
        client.force_authenticate(self.owner)
        r = client.get(
            reverse(
                "events:rsvps",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        by_email = {row["user_email"]: row for row in r.json()}
        self.assertNotIn("a@d.com", by_email)  # cancelled rows hidden
        self.assertEqual(by_email["b@d.com"]["duplicate_hints"], [])
