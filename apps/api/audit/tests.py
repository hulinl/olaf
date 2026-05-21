"""Audit log: service, list endpoint, and integration with event +
RSVP flows that write rows.

Lots of small tests on purpose — audit is the kind of thing that
silently breaks (an exception swallowed in `audit.log()`) and you
only notice when you'd need it most. So we check both the happy path
AND the swallow-on-failure path explicitly.
"""
from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember

from .models import AuditLog
from .services import log as audit_log


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


class AuditServiceTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@a.com")
        self.ws = _make_workspace(self.owner)
        self.event = _make_event(self.ws)

    def test_writes_row_with_all_fields(self) -> None:
        row = audit_log(
            actor=self.owner,
            action="event.update",
            workspace=self.ws,
            target_type="event",
            target_id=self.event.pk,
            summary="Upravil akci",
            payload={"changed_fields": ["title"]},
        )
        assert row is not None  # for mypy / type narrowing
        self.assertEqual(row.actor, self.owner)
        self.assertEqual(row.action, "event.update")
        self.assertEqual(row.workspace, self.ws)
        self.assertEqual(row.target_type, "event")
        self.assertEqual(row.target_id, str(self.event.pk))
        self.assertEqual(row.payload, {"changed_fields": ["title"]})

    def test_target_id_int_is_stringified(self) -> None:
        row = audit_log(
            actor=self.owner,
            action="event.update",
            workspace=self.ws,
            target_type="event",
            target_id=12345,
            summary="x",
        )
        assert row is not None
        self.assertEqual(row.target_id, "12345")

    def test_actor_optional(self) -> None:
        # System-triggered actions (cron) write rows without an actor.
        row = audit_log(
            action="event.purge",
            summary="System purge",
        )
        assert row is not None
        self.assertIsNone(row.actor)

    def test_swallows_failure_returns_none(self) -> None:
        # If AuditLog.objects.create blows up (e.g. migration drift),
        # the helper must return None without raising. The originating
        # action MUST NOT be unwound.
        with mock.patch(
            "audit.services.AuditLog.objects.create",
            side_effect=RuntimeError("boom"),
        ):
            result = audit_log(action="x", summary="y")
        self.assertIsNone(result)


class AuditListEndpointTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner2@a.com")
        self.outsider = _make_user("outsider@a.com")
        self.ws = _make_workspace(self.owner, slug="listws")
        self.event = _make_event(self.ws)
        self.client = APIClient()

        # Seed two rows in our workspace + one in a separate one to
        # exercise the workspace-scoping.
        audit_log(
            actor=self.owner,
            action=AuditLog.ACTION_EVENT_CANCEL,
            workspace=self.ws,
            target_type="event",
            target_id=self.event.pk,
            summary="Zrušil akci",
        )
        audit_log(
            actor=self.owner,
            action=AuditLog.ACTION_EVENT_SOFT_DELETE,
            workspace=self.ws,
            target_type="event",
            target_id=self.event.pk,
            summary="Smazal akci",
        )
        other_ws = _make_workspace(self.outsider, slug="otherws")
        audit_log(
            actor=self.outsider,
            action=AuditLog.ACTION_EVENT_CANCEL,
            workspace=other_ws,
            summary="Cizí workspace",
        )

    def _url(self) -> str:
        return reverse("audit:list")

    def test_owner_sees_only_workspace_rows(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(), {"workspace": self.ws.slug})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["total"], 2)
        summaries = {row["summary"] for row in body["results"]}
        self.assertEqual(summaries, {"Zrušil akci", "Smazal akci"})

    def test_action_filter(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            self._url(),
            {
                "workspace": self.ws.slug,
                "action": AuditLog.ACTION_EVENT_CANCEL,
            },
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["results"][0]["action"], "event.cancel")

    def test_target_filter(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            self._url(),
            {
                "workspace": self.ws.slug,
                "target_type": "event",
                "target_id": str(self.event.pk),
            },
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["total"], 2)

    def test_outsider_gets_403(self) -> None:
        # outsider is owner of a different workspace, not a member of
        # `self.ws`, so they can't read its audit feed.
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._url(), {"workspace": self.ws.slug})
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self._url(), {"workspace": self.ws.slug})
        self.assertIn(r.status_code, (401, 403))

    def test_missing_workspace_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 400)

    def test_unknown_workspace_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(), {"workspace": "ne-existuje"})
        self.assertEqual(r.status_code, 404)

    def test_pagination(self) -> None:
        # Bulk-add 60 more rows on top of the 2 from setUp.
        for i in range(60):
            audit_log(
                actor=self.owner,
                action=AuditLog.ACTION_EVENT_UPDATE,
                workspace=self.ws,
                target_type="event",
                target_id=self.event.pk,
                summary=f"Update {i}",
            )
        self.client.force_authenticate(self.owner)
        r = self.client.get(
            self._url(), {"workspace": self.ws.slug, "page_size": 25}
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["total"], 62)
        self.assertEqual(len(body["results"]), 25)
        # Page 2 returns the next 25.
        r2 = self.client.get(
            self._url(),
            {"workspace": self.ws.slug, "page_size": 25, "page": 2},
        )
        self.assertEqual(len(r2.json()["results"]), 25)

    def test_ordering_is_newest_first(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(), {"workspace": self.ws.slug})
        rows = r.json()["results"]
        # setUp inserts cancel BEFORE soft_delete; newest-first should
        # surface soft_delete on top.
        self.assertEqual(rows[0]["action"], "event.soft_delete")


class AuditFromEventViewsTests(TestCase):
    """End-to-end: hitting the soft-delete / restore / purge / approve /
    reject / update endpoints must write audit rows."""

    def setUp(self) -> None:
        self.owner = _make_user("owner3@a.com")
        self.applicant = _make_user("applicant3@a.com")
        self.ws = _make_workspace(self.owner, slug="auditfwws")
        self.event = _make_event(self.ws, slug="aev")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_soft_delete_writes_audit_row(self) -> None:
        url = reverse(
            "events:soft-delete",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 200)
        row = AuditLog.objects.get(action=AuditLog.ACTION_EVENT_SOFT_DELETE)
        self.assertEqual(row.actor, self.owner)
        self.assertEqual(row.workspace, self.ws)
        self.assertEqual(row.target_id, str(self.event.pk))

    def test_restore_writes_audit_row(self) -> None:
        self.event.soft_delete(user=self.owner)
        r = self.client.post(
            reverse(
                "events:restore",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_EVENT_RESTORE,
                target_id=str(self.event.pk),
            ).exists()
        )

    def test_purge_writes_audit_row_after_hard_delete(self) -> None:
        # Capture pk BEFORE the purge — the row will be gone but the
        # audit pointer must survive.
        self.event.soft_delete(user=self.owner)
        event_pk = self.event.pk
        r = self.client.post(
            reverse(
                "events:purge",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 204)
        row = AuditLog.objects.get(action=AuditLog.ACTION_EVENT_PURGE)
        self.assertEqual(row.target_id, str(event_pk))
        # Workspace ref must outlive the hard-delete (SET_NULL would
        # otherwise null it — but workspace itself isn't deleted, so
        # the FK is still valid).
        self.assertEqual(row.workspace, self.ws)

    def test_cancel_writes_audit_row_with_reason(self) -> None:
        url = reverse(
            "events:cancel",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        r = self.client.post(url, data={"reason": "Plno."}, format="json")
        self.assertEqual(r.status_code, 200)
        row = AuditLog.objects.get(action=AuditLog.ACTION_EVENT_CANCEL)
        self.assertEqual(row.payload.get("reason"), "Plno.")

    def test_approve_writes_audit_row(self) -> None:
        rsvp = RSVP.objects.create(
            event=self.event,
            user=self.applicant,
            status=RSVP.STATUS_PENDING_APPROVAL,
        )
        url = reverse(
            "events:rsvp-approve",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "rsvp_id": rsvp.pk,
            },
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 200)
        row = AuditLog.objects.get(action=AuditLog.ACTION_RSVP_APPROVE)
        self.assertEqual(row.target_id, str(rsvp.pk))

    def test_reject_writes_audit_row_with_reason(self) -> None:
        rsvp = RSVP.objects.create(
            event=self.event,
            user=self.applicant,
            status=RSVP.STATUS_PENDING_APPROVAL,
        )
        url = reverse(
            "events:rsvp-reject",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "rsvp_id": rsvp.pk,
            },
        )
        r = self.client.post(url, data={"reason": "Plno."}, format="json")
        self.assertEqual(r.status_code, 200)
        row = AuditLog.objects.get(action=AuditLog.ACTION_RSVP_REJECT)
        self.assertEqual(row.payload.get("reason"), "Plno.")
