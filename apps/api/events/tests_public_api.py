"""Tests for the public read-only events API (2026-09-11).

Spec: repo hulinl/olafadventures-web docs/olaf-events-public-api-spec.md.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace

from .models import RSVP, Event


def _make_event(workspace, **overrides) -> Event:
    starts = timezone.now() + timedelta(days=14)
    defaults = {
        "slug": "test-akce",
        "title": "Test akce",
        "starts_at": starts,
        "ends_at": starts + timedelta(hours=4),
        "status": Event.STATUS_PUBLISHED,
        "capacity": 10,
        "location_text": "Beskydy",
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=workspace, **defaults)


class PublicEventStatusTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(
            slug="olafadventures", name="Olaf Adventures"
        )

    def _url(self, slug: str) -> str:
        return reverse("public-event-status", kwargs={"slug": slug})

    def test_v2_payload_has_all_identity_and_termin_fields(self) -> None:
        event = _make_event(
            self.ws,
            title="Letní běžecký kemp 2026",
            location_text="Beskydy",
            difficulty=Event.DIFFICULTY_MODERATE,
        )
        resp = self.client.get(self._url(event.slug))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        # Identita
        self.assertEqual(body["slug"], event.slug)
        self.assertEqual(body["title"], "Letní běžecký kemp 2026")
        self.assertIn("olafadventures/e/", body["url"])
        # Termín + místo
        self.assertTrue(body["date"].endswith("Z"))
        self.assertIsNone(body["endDate"])  # jednodenní event
        self.assertEqual(body["duration"], 1)
        self.assertEqual(body["location"], "Beskydy")
        self.assertEqual(body["difficulty"], "Střední")
        # Registrace
        self.assertEqual(body["state"], "open")
        self.assertEqual(body["capacity"], 10)
        self.assertEqual(body["registered"], 0)
        self.assertEqual(body["spotsLeft"], 10)
        self.assertIsNone(body["registrationOpensAt"])
        self.assertIsNone(body["registrationClosesAt"])
        # Headers
        self.assertEqual(resp["Access-Control-Allow-Origin"], "*")
        self.assertIn("public", resp["Cache-Control"])

    def test_multiday_event_endDate_and_duration(self) -> None:
        # 4-denní kemp: 13. srpna -> 16. srpna (inclusive) = 4 dny.
        start = timezone.now().replace(
            year=2026, month=8, day=13, hour=0, minute=0, second=0, microsecond=0
        )
        event = _make_event(
            self.ws,
            slug="letni-kemp",
            starts_at=start,
            ends_at=start + timedelta(days=3),
        )
        body = self.client.get(self._url(event.slug)).json()
        self.assertEqual(body["duration"], 4)
        self.assertIsNotNone(body["endDate"])
        self.assertTrue(body["endDate"].endswith("Z"))

    def test_difficulty_returns_null_when_not_set(self) -> None:
        event = _make_event(self.ws, difficulty="")
        body = self.client.get(self._url(event.slug)).json()
        self.assertIsNone(body["difficulty"])

    def test_state_planned_before_registration_opens(self) -> None:
        # Registrace se otevírá až za týden.
        event = _make_event(
            self.ws,
            registration_opens_at=timezone.now() + timedelta(days=7),
        )
        body = self.client.get(self._url(event.slug)).json()
        self.assertEqual(body["state"], "planned")
        self.assertTrue(body["registrationOpensAt"].endswith("Z"))

    def test_state_soldout_after_registration_closes(self) -> None:
        # Registrace zavřená před hodinou — spec: `soldout` když
        # `now >= registrationClosesAt`.
        event = _make_event(
            self.ws,
            registration_closes_at=timezone.now() - timedelta(hours=1),
        )
        body = self.client.get(self._url(event.slug)).json()
        self.assertEqual(body["state"], "soldout")

    def test_state_soldout_when_capacity_reached(self) -> None:
        event = _make_event(self.ws, capacity=2)
        for i in range(2):
            u = User.objects.create_user(
                email=f"u{i}@example.com",
                password="pass-abcdef-1234",
                first_name=f"U{i}",
                last_name="X",
            )
            RSVP.objects.create(event=event, user=u, status=RSVP.STATUS_YES)
        body = self.client.get(self._url(event.slug)).json()
        self.assertEqual(body["state"], "soldout")
        self.assertEqual(body["spotsLeft"], 0)

    def test_state_running_when_event_in_progress(self) -> None:
        now = timezone.now()
        event = _make_event(
            self.ws,
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(hours=2),
        )
        body = self.client.get(self._url(event.slug)).json()
        self.assertEqual(body["state"], "running")

    def test_state_ended_when_event_past(self) -> None:
        now = timezone.now()
        event = _make_event(
            self.ws,
            starts_at=now - timedelta(days=2),
            ends_at=now - timedelta(days=1, hours=20),
            status=Event.STATUS_COMPLETED,
        )
        body = self.client.get(self._url(event.slug)).json()
        self.assertEqual(body["state"], "ended")

    def test_capacity_null_returns_null_spots_left(self) -> None:
        event = _make_event(self.ws, capacity=None)
        body = self.client.get(self._url(event.slug)).json()
        self.assertIsNone(body["capacity"])
        self.assertIsNone(body["spotsLeft"])
        self.assertEqual(body["state"], "open")

    def test_draft_event_returns_404(self) -> None:
        _make_event(self.ws, slug="tajna-akce", status=Event.STATUS_DRAFT)
        resp = self.client.get(self._url("tajna-akce"))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.json()["error"], "Event not found")

    def test_nonexistent_slug_returns_404(self) -> None:
        resp = self.client.get(self._url("nikdy-neexistoval"))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_archived_event_returns_410(self) -> None:
        event = _make_event(self.ws, slug="archivovana")
        event.deleted_at = timezone.now()
        event.save(update_fields=["deleted_at"])
        resp = self.client.get(self._url("archivovana"))
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.json()["error"], "Event archived")

    def test_no_auth_required(self) -> None:
        event = _make_event(self.ws)
        resp = self.client.get(self._url(event.slug))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_options_preflight(self) -> None:
        resp = self.client.options(self._url("cokoli"))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(resp["Access-Control-Allow-Origin"], "*")


class PublicEventsBatchTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(
            slug="olafadventures", name="Olaf Adventures"
        )
        self.url = reverse("public-events-batch")

    def test_returns_matching_events_in_query_order(self) -> None:
        _make_event(self.ws, slug="alpha")
        _make_event(
            self.ws,
            slug="beta",
            starts_at=timezone.now() + timedelta(days=20),
            ends_at=timezone.now() + timedelta(days=20, hours=4),
        )
        _make_event(
            self.ws,
            slug="gamma",
            starts_at=timezone.now() + timedelta(days=30),
            ends_at=timezone.now() + timedelta(days=30, hours=4),
        )
        resp = self.client.get(self.url + "?slugs=beta,alpha,gamma")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual([e["slug"] for e in body], ["beta", "alpha", "gamma"])

    def test_skips_unknown_slugs_silently(self) -> None:
        _make_event(self.ws, slug="alpha")
        resp = self.client.get(self.url + "?slugs=alpha,neexistuje")
        body = resp.json()
        self.assertEqual([e["slug"] for e in body], ["alpha"])

    def test_skips_draft_events(self) -> None:
        _make_event(self.ws, slug="alpha")
        _make_event(self.ws, slug="draft-only", status=Event.STATUS_DRAFT)
        resp = self.client.get(self.url + "?slugs=alpha,draft-only")
        self.assertEqual([e["slug"] for e in resp.json()], ["alpha"])

    def test_skips_archived_events(self) -> None:
        _make_event(self.ws, slug="alpha")
        archived = _make_event(self.ws, slug="dead")
        archived.deleted_at = timezone.now()
        archived.save(update_fields=["deleted_at"])
        resp = self.client.get(self.url + "?slugs=alpha,dead")
        self.assertEqual([e["slug"] for e in resp.json()], ["alpha"])

    def test_empty_slugs_returns_empty_array(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json(), [])

    def test_cors_and_cache_headers_present(self) -> None:
        _make_event(self.ws, slug="alpha")
        resp = self.client.get(self.url + "?slugs=alpha")
        self.assertEqual(resp["Access-Control-Allow-Origin"], "*")
        self.assertIn("public", resp["Cache-Control"])

    def test_caps_at_50_slugs(self) -> None:
        for i in range(60):
            _make_event(
                self.ws,
                slug=f"e{i}",
                starts_at=timezone.now() + timedelta(days=i + 1),
                ends_at=timezone.now() + timedelta(days=i + 1, hours=4),
            )
        slugs = ",".join(f"e{i}" for i in range(60))
        resp = self.client.get(self.url + f"?slugs={slugs}")
        self.assertLessEqual(len(resp.json()), 50)
