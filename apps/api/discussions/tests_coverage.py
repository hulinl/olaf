"""Discussion wall — coverage gaps on top of `tests.py`.

The existing `tests.py` covers happy paths + obvious permission gates.
This file fills in the trickier edges: topic editing, comment-body
validation, attachment + size limit, reply-chain depth, cross-parent
topic lookup, soft-deleted event wall, cancelled RSVP, admin (not
owner) moderation, comment-count decrement.
"""
from __future__ import annotations

import io
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember

from .models import Comment, Topic


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str) -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, **overrides) -> Event:
    starts = overrides.pop("starts_at", timezone.now() + timedelta(days=14))
    defaults = {
        "slug": "ev",
        "title": "Camp",
        "starts_at": starts,
        "ends_at": overrides.pop("ends_at", starts + timedelta(hours=4)),
        "status": Event.STATUS_PUBLISHED,
        "location_text": "Beskydy",
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=ws, **defaults)


class TopicEditTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@e.com")
        self.member = _make_user("member@e.com")
        self.ws = _make_workspace(self.owner, slug="edit-ws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="Původní",
            body="Původní text",
            author=self.member,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "discussions:workspace-topic-detail",
            kwargs={"slug": self.ws.slug, "topic_id": self.topic.id},
        )

    def test_author_can_edit_title_and_body(self) -> None:
        self.client.force_authenticate(self.member)
        r = self.client.patch(
            self._url(),
            {"title": "Nový titulek", "body": "Aktualizováno"},
            format="json",
        )
        self.assertEqual(r.status_code, drf_status.HTTP_200_OK)
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.title, "Nový titulek")
        self.assertEqual(self.topic.body, "Aktualizováno")

    def test_moderator_can_edit_someone_elses_topic(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.patch(
            self._url(),
            {"body": "Moderátor zasáhl"},
            format="json",
        )
        self.assertEqual(r.status_code, drf_status.HTTP_200_OK)
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.body, "Moderátor zasáhl")

    def test_non_author_member_cannot_edit(self) -> None:
        other = _make_user("other@e.com")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=other,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client.force_authenticate(other)
        r = self.client.patch(
            self._url(), {"body": "haha"}, format="json"
        )
        self.assertEqual(r.status_code, drf_status.HTTP_403_FORBIDDEN)
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.body, "Původní text")

    def test_empty_title_falls_back_to_existing(self) -> None:
        # The view defensively clamps an empty new title back to the
        # current one — so the topic never ends up with title="".
        self.client.force_authenticate(self.member)
        r = self.client.patch(
            self._url(), {"title": "   "}, format="json"
        )
        self.assertEqual(r.status_code, drf_status.HTTP_200_OK)
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.title, "Původní")

    def test_non_moderator_pinned_field_ignored(self) -> None:
        # Even if the body PATCH is allowed (author), the `pinned`
        # flag must NOT flip — that's owner-only.
        self.client.force_authenticate(self.member)
        self.client.patch(
            self._url(),
            {"body": "ok", "pinned": True},
            format="json",
        )
        self.topic.refresh_from_db()
        self.assertFalse(self.topic.pinned)


class EventTopicCreateValidationTests(TestCase):
    """Event topic create has tighter validation than workspace create
    — empty title rejected, pinned/locked only honored if moderator."""

    def setUp(self) -> None:
        self.owner = _make_user("owner@v.com")
        self.participant = _make_user("p@v.com")
        self.ws = _make_workspace(self.owner, slug="val-ws")
        self.event = _make_event(self.ws, slug="val-ev")
        RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()
        self.url = reverse(
            "discussions:event-topics",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_empty_title_rejected(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.post(self.url, {"title": "   ", "body": "x"})
        self.assertEqual(r.status_code, drf_status.HTTP_400_BAD_REQUEST)

    def test_non_mod_pin_request_silently_dropped(self) -> None:
        self.client.force_authenticate(self.participant)
        r = self.client.post(
            self.url, {"title": "Hi", "body": "", "pinned": True}
        )
        self.assertEqual(r.status_code, drf_status.HTTP_201_CREATED)
        topic = Topic.objects.get(pk=r.json()["id"])
        # Member is NOT a moderator → pinned must be False.
        self.assertFalse(topic.pinned)

    def test_moderator_can_pin_on_create(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            self.url, {"title": "Pinned", "body": "", "pinned": True}
        )
        self.assertEqual(r.status_code, drf_status.HTTP_201_CREATED)
        self.assertTrue(r.json()["pinned"])


class CommentValidationTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@c.com")
        self.ws = _make_workspace(self.owner, slug="comm-ws")
        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.owner,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse(
            "discussions:workspace-topic-comments",
            kwargs={"slug": self.ws.slug, "topic_id": self.topic.id},
        )

    def test_empty_body_and_no_attachment_rejected(self) -> None:
        r = self.client.post(self.url, {"body": "   "})
        self.assertEqual(r.status_code, drf_status.HTTP_400_BAD_REQUEST)
        self.assertIn("body", r.json())

    def test_attachment_only_comment_allowed(self) -> None:
        # PNG magic bytes — minimum needed to look like a file, the
        # backend doesn't validate format, only size.
        tiny_png = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)
        tiny_png.name = "photo.png"
        r = self.client.post(
            self.url, {"body": "", "attachment": tiny_png}, format="multipart"
        )
        self.assertEqual(r.status_code, drf_status.HTTP_201_CREATED)

    def test_oversized_attachment_rejected(self) -> None:
        # 6 MB cap → 7 MB should bounce.
        big = io.BytesIO(b"\x00" * (7 * 1024 * 1024))
        big.name = "huge.bin"
        r = self.client.post(
            self.url, {"body": "x", "attachment": big}, format="multipart"
        )
        self.assertEqual(r.status_code, drf_status.HTTP_400_BAD_REQUEST)
        self.assertIn("attachment", r.json())

    def test_legacy_image_field_accepted(self) -> None:
        # Old clients send `image` instead of `attachment`; backend
        # accepts both as a compat shim.
        png = io.BytesIO(b"\x89PNG\r\n\x1a\n")
        png.name = "old.png"
        r = self.client.post(
            self.url, {"body": "x", "image": png}, format="multipart"
        )
        self.assertEqual(r.status_code, drf_status.HTTP_201_CREATED)


class ReplyChainTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("owner@r.com")
        self.ws = _make_workspace(self.owner, slug="reply-ws")
        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.owner,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse(
            "discussions:workspace-topic-comments",
            kwargs={"slug": self.ws.slug, "topic_id": self.topic.id},
        )

    def test_reply_to_reply_collapses_to_root_parent(self) -> None:
        # Comment tree only goes one level deep — replying to a reply
        # re-anchors to the root comment.
        root = self.client.post(self.url, {"body": "root"}).json()
        child = self.client.post(
            self.url, {"body": "child", "parent": root["id"]}
        ).json()
        grand = self.client.post(
            self.url, {"body": "grand", "parent": child["id"]}
        ).json()
        grand_db = Comment.objects.get(pk=grand["id"])
        # `parent` of the grand-child must be the ROOT, not its
        # immediate parent — that's how we keep the thread flat.
        self.assertEqual(grand_db.parent_id, root["id"])

    def test_invalid_parent_id_silently_ignored(self) -> None:
        # A made-up parent id shouldn't 400 — silently drop the
        # association and treat the comment as top-level.
        r = self.client.post(
            self.url, {"body": "orphan", "parent": 99_999_999}
        )
        self.assertEqual(r.status_code, drf_status.HTTP_201_CREATED)
        self.assertIsNone(Comment.objects.get(pk=r.json()["id"]).parent_id)

    def test_parent_from_other_topic_silently_ignored(self) -> None:
        # Replying with a parent_id that belongs to a different topic
        # must not glue the comment to a foreign tree — drop the link.
        other_topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="Other",
            author=self.owner,
        )
        foreign = Comment.objects.create(
            topic=other_topic, body="x", author=self.owner
        )
        r = self.client.post(
            self.url, {"body": "y", "parent": foreign.pk}
        )
        self.assertEqual(r.status_code, drf_status.HTTP_201_CREATED)
        self.assertIsNone(Comment.objects.get(pk=r.json()["id"]).parent_id)


class CrossParentTopicLookupTests(TestCase):
    """A topic id from a workspace shouldn't resolve via the event
    detail endpoint and vice-versa — the parent_type+parent_id pair
    gates lookup."""

    def setUp(self) -> None:
        self.owner = _make_user("owner@xp.com")
        self.ws = _make_workspace(self.owner, slug="xp-ws")
        self.event = _make_event(self.ws, slug="xp-ev")
        RSVP.objects.create(
            event=self.event, user=self.owner, status=RSVP.STATUS_YES
        )
        self.workspace_topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="WS",
            author=self.owner,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_event_endpoint_404s_on_workspace_topic_id(self) -> None:
        r = self.client.get(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                    "topic_id": self.workspace_topic.id,
                },
            )
        )
        self.assertEqual(r.status_code, drf_status.HTTP_404_NOT_FOUND)


class SoftDeletedEventWallTests(TestCase):
    def test_wall_403_when_event_soft_deleted(self) -> None:
        owner = _make_user("owner@sd.com")
        participant = _make_user("p@sd.com")
        ws = _make_workspace(owner, slug="sd-ws")
        event = _make_event(ws, slug="sd-ev")
        RSVP.objects.create(event=event, user=participant, status=RSVP.STATUS_YES)
        event.soft_delete(user=owner)

        client = APIClient()
        client.force_authenticate(participant)
        # The default Event manager hides deleted_at != null, so the
        # view's lookup returns None → 404 (not 403, since auth was
        # fine — there's just no event to talk about).
        r = client.get(
            reverse(
                "discussions:event-topics",
                kwargs={
                    "workspace_slug": ws.slug,
                    "event_slug": event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, drf_status.HTTP_404_NOT_FOUND)


class CancelledRsvpWallTests(TestCase):
    """An RSVP that's been cancelled (by user or owner) must lose
    wall access — symmetric with the pending_approval gate."""

    def test_cancelled_user_blocked(self) -> None:
        owner = _make_user("owner@cx.com")
        cancelled_user = _make_user("c@cx.com")
        ws = _make_workspace(owner, slug="cx-ws")
        event = _make_event(ws, slug="cx-ev")
        RSVP.objects.create(
            event=event,
            user=cancelled_user,
            status=RSVP.STATUS_CANCELLED,
        )
        client = APIClient()
        client.force_authenticate(cancelled_user)
        r = client.get(
            reverse(
                "discussions:event-topics",
                kwargs={
                    "workspace_slug": ws.slug,
                    "event_slug": event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, drf_status.HTTP_403_FORBIDDEN)


class WorkspaceAdminModerationTests(TestCase):
    """ROLE_ADMIN (not just owner) is also a workspace moderator —
    can pin / lock / delete. Permissions today defer to
    `is_workspace_owner`, which returns True for both roles. Test
    locks that contract."""

    def setUp(self) -> None:
        self.owner = _make_user("owner@am.com")
        self.admin = _make_user("admin@am.com")
        self.member = _make_user("member@am.com")
        self.ws = _make_workspace(self.owner, slug="am-ws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.admin,
            role=WorkspaceMember.ROLE_ADMIN,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.member,
        )
        self.client = APIClient()
        self.url = reverse(
            "discussions:workspace-topic-detail",
            kwargs={"slug": self.ws.slug, "topic_id": self.topic.id},
        )

    def test_admin_can_pin(self) -> None:
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self.url, {"pinned": True}, format="json")
        self.assertEqual(r.status_code, drf_status.HTTP_200_OK)
        self.topic.refresh_from_db()
        self.assertTrue(self.topic.pinned)

    def test_admin_can_delete_others_topic(self) -> None:
        self.client.force_authenticate(self.admin)
        r = self.client.delete(self.url)
        self.assertEqual(r.status_code, drf_status.HTTP_204_NO_CONTENT)


class CommentCountDecrementTests(TestCase):
    def test_comment_count_drops_when_comment_deleted(self) -> None:
        owner = _make_user("owner@cd.com")
        ws = _make_workspace(owner, slug="cd-ws")
        topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=ws.id,
            title="T",
            author=owner,
        )
        c1 = Comment.objects.create(topic=topic, body="a", author=owner)
        Comment.objects.create(topic=topic, body="b", author=owner)
        topic.refresh_from_db()
        self.assertEqual(topic.comment_count, 2)

        client = APIClient()
        client.force_authenticate(owner)
        client.delete(
            reverse(
                "discussions:workspace-comment-detail",
                kwargs={
                    "slug": ws.slug,
                    "topic_id": topic.id,
                    "comment_id": c1.id,
                },
            )
        )
        topic.refresh_from_db()
        self.assertEqual(topic.comment_count, 1)
