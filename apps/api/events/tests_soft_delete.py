"""Soft-delete + 30-day Trash coverage.

Behavior under test:
- Soft-deleting an event hides it from the default `Event.objects`
  manager but keeps the row reachable via `Event.all_objects`.
- Restore brings the row back. Purge hard-deletes (only allowed once
  the row is already in the trash).
- The trash list returns only soft-deleted events the user can
  manage.
- The Celery retention task hard-deletes rows past the 30-day window
  and leaves newer ones alone.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event
from .tasks import purge_old_soft_deletes_task


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, slug: str = "ev") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title=f"Event {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
        location_text="Beskydy",
    )


class SoftDeleteModelTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@m.com")
        self.ws = _make_workspace(self.owner)
        self.event = _make_event(self.ws)

    def test_default_manager_hides_soft_deleted(self) -> None:
        self.event.soft_delete(user=self.owner)
        self.assertFalse(
            Event.objects.filter(pk=self.event.pk).exists()
        )
        self.assertTrue(
            Event.all_objects.filter(pk=self.event.pk).exists()
        )

    def test_soft_delete_stamps_audit_pointers(self) -> None:
        self.event.soft_delete(user=self.owner)
        self.event.refresh_from_db()
        self.assertIsNotNone(self.event.deleted_at)
        self.assertEqual(self.event.deleted_by, self.owner)
        self.assertTrue(self.event.is_deleted)

    def test_soft_delete_is_idempotent(self) -> None:
        self.event.soft_delete(user=self.owner)
        first_stamp = self.event.deleted_at
        # Re-soft-delete: must not overwrite the original deleted_at.
        self.event.soft_delete(user=self.owner)
        self.event.refresh_from_db()
        self.assertEqual(self.event.deleted_at, first_stamp)

    def test_restore_clears_audit_pointers(self) -> None:
        self.event.soft_delete(user=self.owner)
        self.event.restore()
        self.event.refresh_from_db()
        self.assertIsNone(self.event.deleted_at)
        self.assertIsNone(self.event.deleted_by)
        self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())

    def test_restore_noop_on_alive(self) -> None:
        # Calling restore on a never-deleted event mustn't break.
        self.event.restore()
        self.assertIsNone(self.event.deleted_at)


class SoftDeleteApiTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@u.com")
        self.outsider = _make_user("outsider@u.com")
        self.ws = _make_workspace(self.owner)
        self.event = _make_event(self.ws)
        self.client = APIClient()

    def _delete_url(self) -> str:
        return reverse(
            "events:soft-delete",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def _restore_url(self) -> str:
        return reverse(
            "events:restore",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def _purge_url(self) -> str:
        return reverse(
            "events:purge",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_owner_can_soft_delete(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._delete_url())
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertIsNotNone(self.event.deleted_at)

    def test_outsider_gets_403(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self._delete_url())
        self.assertEqual(r.status_code, 403)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.deleted_at)

    def test_anon_gets_401(self) -> None:
        r = self.client.post(self._delete_url())
        self.assertIn(r.status_code, (401, 403))

    def test_owner_can_restore(self) -> None:
        self.event.soft_delete(user=self.owner)
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._restore_url())
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.deleted_at)

    def test_restore_404s_for_unknown_event(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            reverse(
                "events:restore",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": "ne-existuje",
                },
            )
        )
        self.assertEqual(r.status_code, 404)

    def test_restore_400s_on_alive_event(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._restore_url())
        self.assertEqual(r.status_code, 400)

    def test_purge_refuses_alive_event(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._purge_url())
        self.assertEqual(r.status_code, 400)
        self.assertTrue(
            Event.all_objects.filter(pk=self.event.pk).exists()
        )

    def test_purge_hard_deletes_trashed_event(self) -> None:
        self.event.soft_delete(user=self.owner)
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._purge_url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(
            Event.all_objects.filter(pk=self.event.pk).exists()
        )

    def test_trash_list_shows_only_deleted_events_user_manages(self) -> None:
        other_event = _make_event(self.ws, slug="other")
        other_event.soft_delete(user=self.owner)
        outsider_ws = _make_workspace(self.outsider, slug="outws")
        outsider_event = _make_event(outsider_ws, slug="outev")
        outsider_event.soft_delete(user=self.outsider)

        self.client.force_authenticate(self.owner)
        r = self.client.get(reverse("events:trash"))
        self.assertEqual(r.status_code, 200)
        slugs = {item["slug"] for item in r.json()}
        # Owner sees their soft-deleted event, but not the outsider's
        # (different workspace) or their own still-alive `self.event`.
        self.assertEqual(slugs, {"other"})


class PurgeTaskTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@p.com")
        self.ws = _make_workspace(self.owner, slug="purgews")

    def test_purges_events_past_retention(self) -> None:
        old = _make_event(self.ws, slug="old")
        old.soft_delete(user=self.owner)
        # Backdate the deleted_at past the 30-day cutoff.
        Event.all_objects.filter(pk=old.pk).update(
            deleted_at=timezone.now() - timedelta(days=31)
        )
        fresh = _make_event(self.ws, slug="fresh")
        fresh.soft_delete(user=self.owner)

        result = purge_old_soft_deletes_task()
        self.assertEqual(result, {"purged": 1})
        self.assertFalse(
            Event.all_objects.filter(pk=old.pk).exists()
        )
        self.assertTrue(
            Event.all_objects.filter(pk=fresh.pk).exists()
        )

    def test_no_op_when_nothing_to_purge(self) -> None:
        # Just an alive event in the workspace — task should be a
        # no-op without touching it.
        _make_event(self.ws, slug="alive")
        result = purge_old_soft_deletes_task()
        self.assertEqual(result, {"purged": 0})

    def test_custom_retention_window(self) -> None:
        # Caller-side override is mostly for tests, but it's a real
        # signature so guard it.
        e = _make_event(self.ws, slug="e")
        e.soft_delete(user=self.owner)
        Event.all_objects.filter(pk=e.pk).update(
            deleted_at=timezone.now() - timedelta(days=2)
        )
        result = purge_old_soft_deletes_task(retention_days=1)
        self.assertEqual(result, {"purged": 1})
