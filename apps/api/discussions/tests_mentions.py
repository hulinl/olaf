"""Coverage for the @-mention parser + fan-out."""
from __future__ import annotations

from django.test import TestCase

from accounts.models import User
from notifications.models import Notification
from workspaces.models import Workspace, WorkspaceMember

from .mentions import (
    extract_mention_candidates,
    notify_mentions,
)
from .models import Comment, Topic


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "First"),
        "last_name": extra.pop("last_name", "Last"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


class ExtractMentionCandidatesTests(TestCase):
    def test_picks_simple_handle(self) -> None:
        self.assertEqual(
            extract_mention_candidates("Ahoj @Marta, co ty?"),
            ["Marta"],
        )

    def test_picks_dotted_handle(self) -> None:
        self.assertEqual(
            extract_mention_candidates("@jan.dvorak co říkáš?"),
            ["jan.dvorak"],
        )

    def test_dedupes_repeated_mentions(self) -> None:
        self.assertEqual(
            extract_mention_candidates("@Marta a zase @marta a @Marta!"),
            ["Marta"],
        )

    def test_strips_trailing_punctuation(self) -> None:
        # Trailing "," / "!" / "?" / ")" should NOT be part of the
        # mention token.
        self.assertEqual(
            extract_mention_candidates("@Marta, ahoj"),
            ["Marta"],
        )

    def test_empty_body(self) -> None:
        self.assertEqual(extract_mention_candidates(""), [])

    def test_no_mentions(self) -> None:
        self.assertEqual(
            extract_mention_candidates("just text without anything"),
            [],
        )


class NotifyMentionsTests(TestCase):
    def setUp(self) -> None:
        # Three users in the workspace: topic author, comment author,
        # and a third member who'll be the mention target.
        self.author = _make_user(
            "author@m.com", first_name="Alice", last_name="A"
        )
        self.commenter = _make_user(
            "commenter@m.com", first_name="Bob", last_name="B"
        )
        self.marta = _make_user(
            "marta@m.com", first_name="Marta", last_name="Member"
        )
        self.outsider = _make_user(
            "out@m.com", first_name="Outsider", last_name="O"
        )

        self.ws = Workspace.objects.create(slug="ws", name="WS")
        for user in (self.author, self.commenter, self.marta):
            WorkspaceMember.objects.create(
                workspace=self.ws,
                user=user,
                role=WorkspaceMember.ROLE_MEMBER,
            )

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.id,
            title="Sraz v 9?",
            author=self.author,
        )

    def _comment(self, body: str, author: User | None = None) -> Comment:
        return Comment.objects.create(
            topic=self.topic,
            body=body,
            author=author or self.commenter,
        )

    def test_creates_notification_for_mentioned_member(self) -> None:
        c = self._comment("Ahoj @Marta!")
        notify_mentions(c)
        notif = Notification.objects.get(recipient=self.marta)
        self.assertEqual(notif.kind, Notification.KIND_DISCUSSION_MENTION)
        self.assertIn("Marta", notif.payload["mention_token"])
        self.assertEqual(notif.payload["topic_id"], self.topic.pk)

    def test_skips_outsider_not_in_workspace(self) -> None:
        # Outsider is not a workspace member → eligible pool excludes
        # them, even though the User row exists.
        c = self._comment("Ahoj @Outsider!")
        notify_mentions(c)
        self.assertEqual(
            Notification.objects.filter(recipient=self.outsider).count(),
            0,
        )

    def test_skips_topic_author_mention(self) -> None:
        # Topic author gets the reply notification via the OTHER
        # path; mentions deduplicate against them.
        c = self._comment("Hele @Alice díky")
        notify_mentions(c)
        self.assertEqual(
            Notification.objects.filter(recipient=self.author).count(),
            0,
        )

    def test_skips_self_mention(self) -> None:
        c = self._comment("Self @Bob", author=self.commenter)
        notify_mentions(c)
        self.assertEqual(
            Notification.objects.filter(recipient=self.commenter).count(),
            0,
        )

    def test_opted_out_user_gets_nothing(self) -> None:
        self.marta.notify_on_discussion_mention = False
        self.marta.save()
        c = self._comment("@Marta tady jsi?")
        notify_mentions(c)
        self.assertEqual(
            Notification.objects.filter(recipient=self.marta).count(),
            0,
        )

    def test_no_match_no_notification(self) -> None:
        # Mention a name that nobody in the workspace has → silent
        # skip, no notification.
        c = self._comment("@Nobody you there?")
        result = notify_mentions(c)
        self.assertEqual(result, 0)

    def test_dotted_full_name_resolves(self) -> None:
        c = self._comment("@Marta.Member nazdar")
        notify_mentions(c)
        notif = Notification.objects.get(recipient=self.marta)
        self.assertEqual(notif.kind, Notification.KIND_DISCUSSION_MENTION)

    def test_multiple_mentions_one_notification_each(self) -> None:
        # Create a 4th workspace member so we have two valid targets.
        adam = _make_user(
            "adam@m.com", first_name="Adam", last_name="A"
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=adam, role=WorkspaceMember.ROLE_MEMBER
        )
        c = self._comment("@Marta a @Adam co vy na to?")
        count = notify_mentions(c)
        self.assertEqual(count, 2)
        self.assertTrue(
            Notification.objects.filter(recipient=self.marta).exists()
        )
        self.assertTrue(
            Notification.objects.filter(recipient=adam).exists()
        )
