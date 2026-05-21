"""Coverage for the user-facing notification feed (Slice 1).

Slice 2 will wire fan-out from discussions / events / payments; this
slice ships just the model + read-only API + mark-read actions.
These tests lock the API contract so when fan-out lands later the
shape doesn't drift silently.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User

from .models import Notification


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="A",
        last_name="B",
        email_verified=True,
    )


def _make_notif(user: User, **overrides) -> Notification:
    return Notification.objects.create(
        recipient=user,
        kind=overrides.pop("kind", Notification.KIND_DISCUSSION_REPLY),
        title=overrides.pop("title", "Marta replied"),
        body=overrides.pop("body", ""),
        link=overrides.pop("link", "/events/x/y/"),
        payload=overrides.pop("payload", {"topic_id": 1}),
        **overrides,
    )


class NotificationModelTests(TestCase):
    def test_is_read_flips_on_mark_read(self) -> None:
        user = _make_user("a@m.com")
        n = _make_notif(user)
        self.assertFalse(n.is_read)
        n.mark_read()
        self.assertTrue(n.is_read)
        self.assertIsNotNone(n.read_at)

    def test_mark_read_is_idempotent(self) -> None:
        user = _make_user("b@m.com")
        n = _make_notif(user)
        n.mark_read()
        first = n.read_at
        n.mark_read()
        n.refresh_from_db()
        # Same timestamp — second call is a no-op.
        self.assertEqual(n.read_at, first)


class NotificationListEndpointTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("alice@n.com")
        self.other = _make_user("bob@n.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/notifications/"

    def test_anon_blocked(self) -> None:
        resp = APIClient().get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_only_returns_callers_notifications(self) -> None:
        _make_notif(self.user, title="Mine")
        _make_notif(self.other, title="Theirs")
        resp = self.client.get(self.url)
        titles = [n["title"] for n in resp.json()]
        self.assertIn("Mine", titles)
        self.assertNotIn("Theirs", titles)

    def test_ordered_newest_first(self) -> None:
        now = timezone.now()
        old = _make_notif(self.user, title="Old")
        old.created_at = now - timedelta(days=1)
        old.save()
        _make_notif(self.user, title="New")
        resp = self.client.get(self.url)
        titles = [n["title"] for n in resp.json()]
        self.assertEqual(titles, ["New", "Old"])

    def test_unread_only_filter(self) -> None:
        unread = _make_notif(self.user, title="Unread")
        read = _make_notif(self.user, title="Read")
        read.mark_read()

        resp = self.client.get(self.url + "?unread_only=1")
        titles = [n["title"] for n in resp.json()]
        self.assertIn("Unread", titles)
        self.assertNotIn("Read", titles)
        # IDs to silence unused-variable; also verifies the rows exist.
        self.assertIsNotNone(unread.id)
        self.assertIsNotNone(read.id)

    def test_limit_caps_at_200(self) -> None:
        resp = self.client.get(self.url + "?limit=999")
        # Even an oversize request must not throw.
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class NotificationCountEndpointTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("count@n.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/notifications/count/"

    def test_zero_initially(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.json()["unread"], 0)

    def test_counts_unread_only(self) -> None:
        _make_notif(self.user, title="A")
        _make_notif(self.user, title="B")
        read = _make_notif(self.user, title="C")
        read.mark_read()
        resp = self.client.get(self.url)
        self.assertEqual(resp.json()["unread"], 2)


class NotificationMarkReadTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("mr@n.com")
        self.other = _make_user("mrother@n.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_marks_single_read(self) -> None:
        n = _make_notif(self.user)
        resp = self.client.post(f"/api/notifications/{n.id}/read/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["is_read"])
        n.refresh_from_db()
        self.assertIsNotNone(n.read_at)

    def test_cannot_mark_other_users_notification(self) -> None:
        n = _make_notif(self.other)
        resp = self.client.post(f"/api/notifications/{n.id}/read/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        n.refresh_from_db()
        self.assertIsNone(n.read_at)

    def test_mark_all_read(self) -> None:
        _make_notif(self.user, title="A")
        _make_notif(self.user, title="B")
        _make_notif(self.other, title="Theirs")  # must NOT be touched
        resp = self.client.post("/api/notifications/read-all/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["flipped"], 2)
        # Other user's row untouched.
        theirs = Notification.objects.get(recipient=self.other)
        self.assertIsNone(theirs.read_at)

    def test_mark_all_when_nothing_unread(self) -> None:
        n = _make_notif(self.user)
        n.mark_read()
        resp = self.client.post("/api/notifications/read-all/")
        self.assertEqual(resp.json()["flipped"], 0)


class DiscussionFanOutTests(TestCase):
    """Verify the discussion-side fan-out creates Notification rows
    alongside the e-mail + push it already sends. Same opt-out gates
    (notify_on_discussion_reply / notify_on_discussion_announce)
    govern all three channels."""

    def setUp(self) -> None:
        from discussions.models import Topic
        from workspaces.models import Workspace, WorkspaceMember

        self.author = _make_user("author@fan.com")
        self.replier = _make_user("replier@fan.com")
        self.member = _make_user("member@fan.com")
        self.ws = Workspace.objects.create(slug="fanws", name="Fanws")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.author,
            role=WorkspaceMember.ROLE_OWNER,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="Sraz v 9?",
            body="Kdy se sejdeme?",
            author=self.author,
        )

    def test_reply_creates_notification_for_topic_author(self) -> None:
        from discussions.emails import send_comment_notification
        from discussions.models import Comment

        comment = Comment.objects.create(
            topic=self.topic,
            author=self.replier,
            body="V 9 jo!",
        )
        send_comment_notification(comment)

        notifs = Notification.objects.filter(recipient=self.author)
        self.assertEqual(notifs.count(), 1)
        n = notifs.first()
        self.assertEqual(n.kind, Notification.KIND_DISCUSSION_REPLY)
        self.assertIn("odpověděl", n.title)
        self.assertEqual(n.payload["topic_id"], self.topic.pk)
        self.assertEqual(n.payload["comment_id"], comment.pk)
        self.assertFalse(n.is_read)

    def test_self_reply_does_not_create_notification(self) -> None:
        from discussions.emails import send_comment_notification
        from discussions.models import Comment

        comment = Comment.objects.create(
            topic=self.topic,
            author=self.author,
            body="self note",
        )
        send_comment_notification(comment)
        self.assertEqual(
            Notification.objects.filter(recipient=self.author).count(),
            0,
        )

    def test_opted_out_user_gets_no_notification(self) -> None:
        from discussions.emails import send_comment_notification
        from discussions.models import Comment

        self.author.notify_on_discussion_reply = False
        self.author.save()
        comment = Comment.objects.create(
            topic=self.topic,
            author=self.replier,
            body="reply",
        )
        send_comment_notification(comment)
        self.assertEqual(
            Notification.objects.filter(recipient=self.author).count(),
            0,
        )

    def test_announce_creates_notification_for_each_member(self) -> None:
        from discussions.emails import send_topic_announce
        from discussions.models import Topic

        new_topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="Důležité!",
            body="Sraz se mění",
            author=self.author,
        )
        send_topic_announce(new_topic)
        # Author excluded from own announce.
        self.assertEqual(
            Notification.objects.filter(recipient=self.author).count(),
            0,
        )
        # Member receives one.
        notifs = Notification.objects.filter(recipient=self.member)
        self.assertEqual(notifs.count(), 1)
        n = notifs.first()
        self.assertEqual(n.kind, Notification.KIND_DISCUSSION_ANNOUNCE)
        self.assertIn("Důležité!", n.title)
