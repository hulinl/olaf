"""Smoke tests for the discussion wall — permissions + happy paths."""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember


def _make_event(workspace, **overrides):
    starts = timezone.now() + timedelta(days=14)
    defaults = {
        "slug": "test-event",
        "title": "Test event",
        "starts_at": starts,
        "ends_at": starts + timedelta(hours=4),
        "status": Event.STATUS_PUBLISHED,
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=workspace, **defaults)


class WorkspaceWallTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Wner",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.outsider = User.objects.create_user(
            email="out@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ut",
            email_verified=True,
        )

    def test_outsider_cannot_read(self):
        self.client.force_authenticate(self.outsider)
        url = reverse("discussions:workspace-topics", kwargs={"slug": "olaf"})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_owner_creates_and_lists_topic(self):
        self.client.force_authenticate(self.owner)
        url = reverse("discussions:workspace-topics", kwargs={"slug": "olaf"})
        resp = self.client.post(
            url, {"title": "Vítejte!", "body": "Ahoj členové", "pinned": True}
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_201_CREATED)
        self.assertTrue(resp.json()["pinned"])

        list_resp = self.client.get(url)
        self.assertEqual(len(list_resp.json()), 1)


class EventWallTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Wner",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.event = _make_event(self.ws)
        self.participant = User.objects.create_user(
            email="p@example.com",
            password="pass-abcdef-1234",
            first_name="P",
            last_name="One",
            email_verified=True,
        )
        RSVP.objects.create(
            event=self.event, user=self.participant, status=RSVP.STATUS_YES
        )
        self.stranger = User.objects.create_user(
            email="s@example.com",
            password="pass-abcdef-1234",
            first_name="S",
            last_name="Tranger",
            email_verified=True,
        )

    def test_stranger_blocked(self):
        self.client.force_authenticate(self.stranger)
        url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_participant_creates_topic_and_comment(self):
        self.client.force_authenticate(self.participant)
        topics_url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        resp = self.client.post(topics_url, {"title": "Sraz v 9?", "body": ""})
        self.assertEqual(resp.status_code, drf_status.HTTP_201_CREATED)
        topic_id = resp.json()["id"]

        comments_url = reverse(
            "discussions:event-topic-comments",
            kwargs={
                "workspace_slug": "olaf",
                "event_slug": "test-event",
                "topic_id": topic_id,
            },
        )
        comment = self.client.post(comments_url, {"body": "Souhlas"})
        self.assertEqual(comment.status_code, drf_status.HTTP_201_CREATED)

        detail = self.client.get(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            )
        )
        self.assertEqual(detail.json()["comment_count"], 1)
        self.assertEqual(len(detail.json()["comments"]), 1)

    def test_owner_can_moderate(self):
        self.client.force_authenticate(self.participant)
        topics_url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        created = self.client.post(topics_url, {"title": "Hi", "body": ""})
        topic_id = created.json()["id"]

        self.client.force_authenticate(self.owner)
        resp = self.client.delete(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            )
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_204_NO_CONTENT)

    def test_locked_topic_rejects_new_comments(self):
        self.client.force_authenticate(self.participant)
        topics_url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        topic_id = self.client.post(
            topics_url, {"title": "Hi", "body": ""}
        ).json()["id"]

        self.client.force_authenticate(self.owner)
        self.client.patch(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            ),
            {"locked": True},
            format="json",
        )

        self.client.force_authenticate(self.participant)
        resp = self.client.post(
            reverse(
                "discussions:event-topic-comments",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            ),
            {"body": "Late comment"},
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Likes (topic + comment, both scopes)
# ---------------------------------------------------------------------------


class TopicLikeTests(TestCase):
    """Toggling a like on a topic counts the right way and is
    idempotent on repeated POSTs from the same user."""

    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.owner = User.objects.create_user(
            email="owner@like.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        from .models import Topic

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.owner,
        )

    def _like_url(self):
        return reverse(
            "discussions:workspace-topic-like",
            kwargs={"slug": "olaf", "topic_id": self.topic.id},
        )

    def test_like_then_unlike(self):
        from .models import TopicLike

        self.client.force_authenticate(self.owner)
        resp = self.client.post(self._like_url())
        self.assertEqual(resp.status_code, drf_status.HTTP_200_OK)
        self.assertEqual(TopicLike.objects.filter(topic=self.topic).count(), 1)
        # Second POST is idempotent — should not double-count.
        self.client.post(self._like_url())
        self.assertEqual(TopicLike.objects.filter(topic=self.topic).count(), 1)
        # DELETE removes the like.
        self.client.delete(self._like_url())
        self.assertEqual(TopicLike.objects.filter(topic=self.topic).count(), 0)

    def test_like_requires_auth(self):
        resp = APIClient().post(self._like_url())
        self.assertEqual(resp.status_code, drf_status.HTTP_401_UNAUTHORIZED)


class CommentLikeTests(TestCase):
    """Comment likes share the toggle pattern with topic likes."""

    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf-c", name="Olaf C")
        self.owner = User.objects.create_user(
            email="owner@clike.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        from .models import Comment, Topic

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.owner,
        )
        self.comment = Comment.objects.create(
            topic=self.topic,
            body="hello",
            author=self.owner,
        )

    def test_toggle_comment_like(self):
        from .models import CommentLike

        self.client.force_authenticate(self.owner)
        url = reverse(
            "discussions:workspace-comment-like",
            kwargs={
                "slug": "olaf-c",
                "topic_id": self.topic.id,
                "comment_id": self.comment.id,
            },
        )
        self.client.post(url)
        self.assertEqual(
            CommentLike.objects.filter(comment=self.comment).count(), 1
        )
        self.client.delete(url)
        self.assertEqual(
            CommentLike.objects.filter(comment=self.comment).count(), 0
        )


# ---------------------------------------------------------------------------
# Moderation — pin, delete
# ---------------------------------------------------------------------------


class TopicModerationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="mod", name="Mod")
        self.owner = User.objects.create_user(
            email="o@m.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        self.member = User.objects.create_user(
            email="m@m.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        from .models import Topic

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.member,
        )

    def _detail_url(self):
        return reverse(
            "discussions:workspace-topic-detail",
            kwargs={"slug": "mod", "topic_id": self.topic.id},
        )

    def test_owner_can_pin(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(
            self._detail_url(), {"pinned": True}, format="json"
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_200_OK)
        self.topic.refresh_from_db()
        self.assertTrue(self.topic.pinned)

    def test_non_owner_cannot_pin(self):
        self.client.force_authenticate(self.member)
        resp = self.client.patch(
            self._detail_url(), {"pinned": True}, format="json"
        )
        # Either 403 or silently ignored — the only thing we guard is
        # that the DB never flips on a non-moderator.
        self.topic.refresh_from_db()
        self.assertFalse(self.topic.pinned)
        self.assertIn(
            resp.status_code,
            (drf_status.HTTP_200_OK, drf_status.HTTP_403_FORBIDDEN),
        )

    def test_owner_can_delete_anyone_topic(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.delete(self._detail_url())
        self.assertEqual(resp.status_code, drf_status.HTTP_204_NO_CONTENT)

    def test_author_can_delete_own_topic(self):
        self.client.force_authenticate(self.member)
        resp = self.client.delete(self._detail_url())
        self.assertEqual(resp.status_code, drf_status.HTTP_204_NO_CONTENT)

    def test_non_author_member_cannot_delete(self):
        other_member = User.objects.create_user(
            email="other@m.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=other_member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client.force_authenticate(other_member)
        resp = self.client.delete(self._detail_url())
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)


class CommentReplyChainTests(TestCase):
    """Comments support a single parent — verify the parent FK is
    persisted and counted in the topic's comment_count."""

    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="reply", name="Reply")
        self.owner = User.objects.create_user(
            email="o@r.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        from .models import Topic

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="T",
            author=self.owner,
        )

    def test_reply_to_comment_persists_parent(self):
        from .models import Comment

        self.client.force_authenticate(self.owner)
        comments_url = reverse(
            "discussions:workspace-topic-comments",
            kwargs={"slug": "reply", "topic_id": self.topic.id},
        )
        root = self.client.post(comments_url, {"body": "root"}).json()
        reply = self.client.post(
            comments_url, {"body": "child", "parent": root["id"]}
        ).json()
        c = Comment.objects.get(pk=reply["id"])
        self.assertEqual(c.parent_id, root["id"])

    def test_topic_comment_count_increments_on_add(self):
        self.client.force_authenticate(self.owner)
        comments_url = reverse(
            "discussions:workspace-topic-comments",
            kwargs={"slug": "reply", "topic_id": self.topic.id},
        )
        self.client.post(comments_url, {"body": "one"})
        self.client.post(comments_url, {"body": "two"})
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.comment_count, 2)


# ---------------------------------------------------------------------------
# Event wall — pending RSVP can't read
# ---------------------------------------------------------------------------


class EventWallPendingApprovalTests(TestCase):
    """An RSVP awaiting approval must NOT see the event wall yet —
    the owner might still reject the registration. Same gate as the
    backend's can_access_event_wall helper."""

    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="pending-ws", name="Pending")
        self.owner = User.objects.create_user(
            email="o@p.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        self.event = _make_event(
            self.ws,
            slug="approval-event",
            requires_approval=True,
        )
        self.pending_user = User.objects.create_user(
            email="p@p.com",
            password="pass-abcdef-1234",
            email_verified=True,
        )
        RSVP.objects.create(
            event=self.event,
            user=self.pending_user,
            status=RSVP.STATUS_PENDING_APPROVAL,
        )

    def test_pending_rsvp_cannot_read_wall(self):
        self.client.force_authenticate(self.pending_user)
        url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "pending-ws", "event_slug": "approval-event"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)
