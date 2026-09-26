"""Smoke tests pro public race calendar API."""
from __future__ import annotations

from datetime import date, timedelta

from django.test import TestCase
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from races.models import Race, RaceFavorite


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
        self.assertTrue(resp.json()["is_favorite"])
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            1,
        )

        # Toggle off
        resp = self.client.delete(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["is_favorite"])
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
