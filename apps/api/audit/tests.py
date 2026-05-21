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

    def test_create_writes_audit_row(self) -> None:
        starts = (timezone.now() + timedelta(days=20)).isoformat()
        ends = (timezone.now() + timedelta(days=20, hours=4)).isoformat()
        url = reverse("events:create", kwargs={"workspace_slug": self.ws.slug})
        r = self.client.post(
            url,
            data={
                "slug": "novy-camp",
                "title": "Nový camp",
                "starts_at": starts,
                "ends_at": ends,
                "status": Event.STATUS_DRAFT,
                "visibility": "public",
                "tz": "Europe/Prague",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.json())
        row = AuditLog.objects.get(action=AuditLog.ACTION_EVENT_CREATE)
        self.assertEqual(row.actor, self.owner)
        self.assertEqual(row.workspace, self.ws)
        self.assertEqual(row.payload.get("event_slug"), "novy-camp")

    def test_update_with_no_changes_does_not_log(self) -> None:
        # Empty PATCH against a saved event mustn't write a row — the
        # audit log gets noisy fast if updates with no diff log too.
        url = reverse(
            "events:update",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        # Re-submit the same title (which has no observable effect on
        # the diff helper for participant-visible fields).
        r = self.client.patch(
            url,
            data={"title": self.event.title},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_EVENT_UPDATE
            ).exists()
        )


class AuditFromMemberRoleTests(TestCase):
    """workspace_member.role_change is written by promote / demote /
    handover endpoints. Handover writes two rows in one transaction."""

    def setUp(self) -> None:
        self.owner = _make_user("roleowner@a.com")
        self.target = _make_user("roletarget@a.com")
        self.ws = _make_workspace(self.owner, slug="rolews")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.target,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_promote_writes_role_change(self) -> None:
        r = self.client.post(
            reverse(
                "workspaces:member-promote",
                kwargs={"slug": self.ws.slug, "user_id": self.target.pk},
            )
        )
        self.assertEqual(r.status_code, 200)
        row = AuditLog.objects.get(
            action=AuditLog.ACTION_MEMBER_ROLE_CHANGE
        )
        self.assertEqual(row.payload["new_role"], "admin")
        self.assertEqual(row.payload["old_role"], "member")
        self.assertEqual(row.payload["user_id"], self.target.pk)

    def test_demote_writes_role_change(self) -> None:
        m = WorkspaceMember.objects.get(workspace=self.ws, user=self.target)
        m.role = WorkspaceMember.ROLE_ADMIN
        m.save(update_fields=["role"])
        r = self.client.post(
            reverse(
                "workspaces:member-demote",
                kwargs={"slug": self.ws.slug, "user_id": self.target.pk},
            )
        )
        self.assertEqual(r.status_code, 200)
        row = AuditLog.objects.get(
            action=AuditLog.ACTION_MEMBER_ROLE_CHANGE
        )
        self.assertEqual(row.payload["new_role"], "member")
        self.assertEqual(row.payload["old_role"], "admin")

    def test_promote_no_op_does_not_log(self) -> None:
        # Target is already admin → promote returns 200 but writes no row.
        m = WorkspaceMember.objects.get(workspace=self.ws, user=self.target)
        m.role = WorkspaceMember.ROLE_ADMIN
        m.save(update_fields=["role"])
        self.client.post(
            reverse(
                "workspaces:member-promote",
                kwargs={"slug": self.ws.slug, "user_id": self.target.pk},
            )
        )
        self.assertFalse(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_MEMBER_ROLE_CHANGE
            ).exists()
        )

    def test_handover_writes_two_role_change_rows(self) -> None:
        # Promote target to admin first (so handover precondition holds).
        m = WorkspaceMember.objects.get(workspace=self.ws, user=self.target)
        m.role = WorkspaceMember.ROLE_ADMIN
        m.save(update_fields=["role"])
        # Reset any audit noise from setUp.
        AuditLog.objects.all().delete()
        r = self.client.post(
            reverse(
                "workspaces:member-handover",
                kwargs={"slug": self.ws.slug, "user_id": self.target.pk},
            )
        )
        self.assertEqual(r.status_code, 200)
        rows = list(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_MEMBER_ROLE_CHANGE
            ).order_by("created_at")
        )
        self.assertEqual(len(rows), 2)
        # First row: target was promoted to owner.
        self.assertEqual(rows[0].payload["new_role"], "owner")
        # Second row: original owner demoted to admin.
        self.assertEqual(rows[1].payload["new_role"], "admin")


class AuditFromDiscussionTests(TestCase):
    """Topic / comment deletes from both workspace and event walls
    should write `discussion.topic.delete` / `discussion.comment.delete`
    rows with a `by_moderator` flag distinguishing author-deletes-own
    from mod-cleans-up-others."""

    def setUp(self) -> None:
        self.owner = _make_user("discowner@a.com")
        self.member = _make_user("discmember@a.com")
        self.ws = _make_workspace(self.owner, slug="discws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.event = _make_event(self.ws, slug="disc-ev")
        self.client = APIClient()

    def test_owner_deletes_own_workspace_topic(self) -> None:
        from discussions.models import Topic

        topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="Sraz v 9?",
            author=self.owner,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.delete(
            reverse(
                "discussions:workspace-topic-detail",
                kwargs={"slug": self.ws.slug, "topic_id": topic.pk},
            )
        )
        self.assertEqual(r.status_code, 204)
        row = AuditLog.objects.get(action=AuditLog.ACTION_TOPIC_DELETE)
        self.assertEqual(row.workspace, self.ws)
        # Owner deleting their OWN topic → by_moderator False (the rule
        # is "did a mod delete someone else's content?", not "is the
        # actor a mod?").
        self.assertEqual(row.payload["by_moderator"], False)

    def test_moderator_deletes_other_users_comment(self) -> None:
        from discussions.models import Comment, Topic

        topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.member,
        )
        comment = Comment.objects.create(
            topic=topic, body="špatný komentář", author=self.member
        )
        self.client.force_authenticate(self.owner)
        r = self.client.delete(
            reverse(
                "discussions:workspace-comment-detail",
                kwargs={
                    "slug": self.ws.slug,
                    "topic_id": topic.pk,
                    "comment_id": comment.pk,
                },
            )
        )
        self.assertEqual(r.status_code, 204)
        row = AuditLog.objects.get(action=AuditLog.ACTION_COMMENT_DELETE)
        self.assertEqual(row.payload["by_moderator"], True)
        self.assertIn("špatný", row.payload["excerpt"])

    def test_author_deletes_own_comment_not_flagged_as_mod(self) -> None:
        from discussions.models import Comment, Topic

        topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.member,
        )
        comment = Comment.objects.create(
            topic=topic, body="vlastní", author=self.member
        )
        self.client.force_authenticate(self.member)
        r = self.client.delete(
            reverse(
                "discussions:workspace-comment-detail",
                kwargs={
                    "slug": self.ws.slug,
                    "topic_id": topic.pk,
                    "comment_id": comment.pk,
                },
            )
        )
        self.assertEqual(r.status_code, 204)
        row = AuditLog.objects.get(action=AuditLog.ACTION_COMMENT_DELETE)
        self.assertEqual(row.payload["by_moderator"], False)

    def test_event_topic_delete_logs_with_event_workspace(self) -> None:
        from discussions.models import Topic
        from events.models import RSVP

        # Member needs an RSVP to access the event wall in the first
        # place — owner already has access via workspace membership.
        RSVP.objects.create(
            event=self.event,
            user=self.member,
            status=RSVP.STATUS_YES,
        )
        topic = Topic.objects.create(
            parent_type=Topic.PARENT_EVENT,
            parent_id=self.event.id,
            title="Event topic",
            author=self.member,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.delete(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                    "topic_id": topic.pk,
                },
            )
        )
        self.assertEqual(r.status_code, 204)
        row = AuditLog.objects.get(action=AuditLog.ACTION_TOPIC_DELETE)
        # Workspace on the audit row resolves through the event, not
        # the topic — the row is queryable from the workspace's audit
        # page regardless of where in the workspace the topic lived.
        self.assertEqual(row.workspace, self.ws)
        self.assertEqual(row.payload["parent_type"], Topic.PARENT_EVENT)
        self.assertEqual(row.payload["by_moderator"], True)

    def test_403_does_not_write_row(self) -> None:
        from discussions.models import Topic

        # Outsider with no relationship to the workspace can't even
        # access the wall — endpoint returns 403, audit MUST not log.
        outsider = _make_user("outdisc@a.com")
        topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.owner,
        )
        self.client.force_authenticate(outsider)
        r = self.client.delete(
            reverse(
                "discussions:workspace-topic-detail",
                kwargs={"slug": self.ws.slug, "topic_id": topic.pk},
            )
        )
        self.assertEqual(r.status_code, 403)
        self.assertFalse(
            AuditLog.objects.filter(
                action=AuditLog.ACTION_TOPIC_DELETE
            ).exists()
        )
