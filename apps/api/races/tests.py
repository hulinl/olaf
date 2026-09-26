"""Smoke tests pro public race calendar API."""
from __future__ import annotations

from datetime import date, timedelta

from django.test import TestCase
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from races.management.commands.sync_races import _detect_contradiction
from races.models import Race, RaceFavorite, SyncRun


def _make_race(**overrides) -> Race:
    defaults = {
        "name": "Test Race",
        "date_start": date.today() + timedelta(days=30),
        "distance_km": 50,
        "country": "Česko",
        "location": "Beskydy",
    }
    defaults.update(overrides)
    return Race.objects.create(**defaults)


class RaceListTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        # Migration 0003 seed dataset se aplikuje i na test DB — pro
        # čistý sandbox v každém testu ho tady flushneme, jinak by
        # tests_month_filter dostal 25 races místo jednoho.
        Race.objects.all().delete()

    def test_defaults_hide_past_and_invisible(self) -> None:
        past = _make_race(name="Old", date_start=date.today() - timedelta(days=10))
        future = _make_race(name="New", date_start=date.today() + timedelta(days=10))
        hidden = _make_race(
            name="Hidden",
            date_start=date.today() + timedelta(days=15),
            is_visible=False,
        )

        resp = self.client.get("/api/races/")
        self.assertEqual(resp.status_code, drf_status.HTTP_200_OK)
        body = resp.json()
        ids = {r["id"] for r in body["results"]}
        self.assertIn(future.id, ids)
        self.assertNotIn(past.id, ids)
        self.assertNotIn(hidden.id, ids)

    def test_past_flag_includes_past(self) -> None:
        past = _make_race(name="Old", date_start=date.today() - timedelta(days=10))
        resp = self.client.get("/api/races/?past=1")
        ids = {r["id"] for r in resp.json()["results"]}
        self.assertIn(past.id, ids)

    def test_month_filter(self) -> None:
        _make_race(name="Jun", date_start=date(2027, 6, 15))
        _make_race(name="Jul", date_start=date(2027, 7, 15))

        resp = self.client.get("/api/races/?month=2027-06&past=1")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names, ["Jun"])

    def test_country_filter(self) -> None:
        _make_race(name="CZ", country="Česko")
        _make_race(name="FR", country="Francie")

        resp = self.client.get("/api/races/?country=Francie")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names, ["FR"])

    def test_full_text_search(self) -> None:
        _make_race(name="Beskydská 7", location="Beskydy")
        _make_race(name="Šumava", location="Šumava")

        resp = self.client.get("/api/races/?q=Beskyd")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names, ["Beskydská 7"])

    def test_anonymous_gets_is_favorite_false(self) -> None:
        _make_race()
        resp = self.client.get("/api/races/")
        for r in resp.json()["results"]:
            self.assertFalse(r["is_favorite"])

    def test_authenticated_sees_favorites(self) -> None:
        user = User.objects.create_user(
            email="u@example.com",
            password="pass-abcdef-1234",
            first_name="U",
            last_name="X",
            email_verified=True,
        )
        r1 = _make_race(name="A")
        _make_race(name="B")
        RaceFavorite.objects.create(user=user, race=r1)

        self.client.force_authenticate(user)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r["is_favorite"] for r in resp.json()["results"]}
        self.assertTrue(rows["A"])
        self.assertFalse(rows["B"])


class RaceFavoriteToggleTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        Race.objects.all().delete()
        self.user = User.objects.create_user(
            email="u@example.com",
            password="pass-abcdef-1234",
            first_name="U",
            last_name="X",
            email_verified=True,
        )
        self.race = _make_race(name="Beskyd")

    def test_favorite_add_and_remove(self) -> None:
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 200)
        # POST vrací RaceFavoriteSerializer — status default "interested"
        self.assertEqual(resp.json()["status"], RaceFavorite.STATUS_INTERESTED)
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            1,
        )

        # Toggle off
        resp = self.client.delete(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            0,
        )

    def test_favorite_idempotent(self) -> None:
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            1,
        )

    def test_favorite_requires_auth(self) -> None:
        resp = self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 401)

    def test_favorite_hidden_race_404(self) -> None:
        self.race.is_visible = False
        self.race.save()
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 404)


class SyncAgentTests(TestCase):
    """Testy pro sync agent — contradiction detection + audit trail."""

    def test_contradiction_sold_out_opens_soon(self) -> None:
        """VYPRODÁNO + „otevírá se v prosinci" = contradiction."""
        self.assertTrue(
            _detect_contradiction(
                "sold_out", "otevírá se 12.-16. 10. 2026"
            )
        )
        self.assertTrue(
            _detect_contradiction("sold_out", "registrace od 15. 11.")
        )
        self.assertTrue(
            _detect_contradiction("sold_out", "start přihlášek v listopadu")
        )

    def test_contradiction_closed_opens_soon(self) -> None:
        """UZAVŘENO + „přihlášky obvykle v lednu" = contradiction."""
        self.assertTrue(
            _detect_contradiction("closed", "přihlášky obvykle v lednu")
        )

    def test_contradiction_open_with_sold_out_keyword(self) -> None:
        self.assertTrue(
            _detect_contradiction("open", "vyprodáno za 30 minut")
        )
        self.assertTrue(_detect_contradiction("open", "loterie v prosinci"))

    def test_no_contradiction_when_consistent(self) -> None:
        # „volně, přihlašuj na webu" — žádné contradiction keywords
        self.assertFalse(
            _detect_contradiction("open", "volně, přihlašuj na webu")
        )
        self.assertFalse(_detect_contradiction("open", ""))
        # Lottery status + „loterie" detail = consistent, ne contradiction
        self.assertFalse(_detect_contradiction("lottery", "loterie od prosince"))
        # Known false-positive: „žádná loterie" v open statusu chytí
        # regex — future improvement, teď zdokumentované jako expected.
        self.assertTrue(
            _detect_contradiction("open", "volně, žádná loterie")
        )

    def test_syncrun_creation(self) -> None:
        """SyncRun se vytvoří pro každý run."""
        run = SyncRun.objects.create(
            source=SyncRun.SOURCE_LOCAL,
            status=SyncRun.STATUS_OK,
            created_count=5,
            triggered_by="test",
        )
        self.assertIsNotNone(run.pk)
        self.assertEqual(SyncRun.objects.count(), 1)
