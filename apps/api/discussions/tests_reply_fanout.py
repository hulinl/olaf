"""Tests for the expanded reply-notification fan-out.

`send_comment_notification` should notify:
- the topic author (opt-in respected),
- every prior commenter in the thread (opt-in respected),
- for event topics: the workspace owner + every EventCollaborator
  (mandatory — bypasses ``notify_on_discussion_reply``).

The commenter themself is always excluded.
"""
from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from discussions.emails import send_comment_notification
from discussions.models import Comment, Topic
from events.models import Event, EventCollaborator
from notifications.models import Notification
from workspaces.models import Workspace, WorkspaceMember


def _user(email: str, **kwargs) -> User:
    return User.objects.create_user(
        email=email,
        password="pass-abcdef-1234",
        first_name=email.split("@")[0],
        last_name="X",
        email_verified=True,
        **kwargs,
    )


class WorkspaceReplyFanoutTests(TestCase):
    """Workspace-scoped topic — no mandatory bypass, pure opt-in flow."""

    def setUp(self):
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.author = _user("author@example.com")
        self.member1 = _user("m1@example.com")
        self.member2 = _user("m2@example.com")
        self.member3 = _user("m3@example.com")
        for u in (self.author, self.member1, self.member2, self.member3):
            WorkspaceMember.objects.create(
                workspace=self.ws, user=u, role=WorkspaceMember.ROLE_MEMBER
            )

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.pk,
            author=self.author,
            title="Kdo pojede?",
            body="Návrh: víkend 15. května.",
        )
        Comment.objects.create(topic=self.topic, author=self.member1, body="Já beru!")
        Comment.objects.create(topic=self.topic, author=self.member2, body="Jsem in.")

    def test_reply_notifies_author_and_prior_commenters(self):
        """Nová odpověď = topic autor + oba předchozí komentátoři,
        commentera samotného vyfiltrujeme."""
        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.member3, body="Přidávám se."
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertEqual(
            recipients,
            {"author@example.com", "m1@example.com", "m2@example.com"},
        )
        bell_recipients = set(
            Notification.objects.filter(
                kind=Notification.KIND_DISCUSSION_REPLY,
                payload__comment_id=new.pk,
            ).values_list("recipient__email", flat=True)
        )
        self.assertEqual(
            bell_recipients,
            {"author@example.com", "m1@example.com", "m2@example.com"},
        )

    def test_commenter_never_self_pings(self):
        """Když topic autor sám odpoví do svého threadu, sám sebe
        nedostane, ale zbytek předchozích komentátorů ano."""
        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.author, body="Ještě detail."
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertEqual(recipients, {"m1@example.com", "m2@example.com"})
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.author, payload__comment_id=new.pk
            ).exists()
        )

    def test_opt_out_respected_for_non_mandatory(self):
        """member1 si vypnul reply notifikace → nedostane e-mail ani
        bell entry, ostatní ano."""
        self.member1.notify_on_discussion_reply = False
        self.member1.save(update_fields=["notify_on_discussion_reply"])

        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.member3, body="Hmmm."
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertIn("author@example.com", recipients)
        self.assertIn("m2@example.com", recipients)
        self.assertNotIn("m1@example.com", recipients)
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.member1, payload__comment_id=new.pk
            ).exists()
        )

    def test_first_reply_still_notifies_author(self):
        """Na úplně prvním replyu (žádný prior commenter) je audience =
        jen topic autor."""
        # Fresh topic bez předchozích komentářů.
        topic = Topic.objects.create(
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=self.ws.pk,
            author=self.author,
            title="Fresh thread",
            body="",
        )
        mail.outbox.clear()
        new = Comment.objects.create(
            topic=topic, author=self.member1, body="První reakce."
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertEqual(recipients, {"author@example.com"})

    def test_dedup_between_author_and_commenter(self):
        """Když je topic autor zároveň i prior commenter, dostane jen
        jednu notifikaci (dedup přes user_id, ne kanály)."""
        Comment.objects.create(
            topic=self.topic, author=self.author, body="Ještě jedna moje."
        )
        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.member3, body="Tak ok."
        )

        send_comment_notification(new)

        emails_to_author = [m for m in mail.outbox if "author@example.com" in m.to]
        self.assertEqual(len(emails_to_author), 1)
        bell_for_author = Notification.objects.filter(
            recipient=self.author, payload__comment_id=new.pk
        )
        self.assertEqual(bell_for_author.count(), 1)


class EventReplyFanoutTests(TestCase):
    """Event-scoped topic — workspace owner + EventCollaborator jsou
    mandatory. Opt-out je obchází."""

    def setUp(self):
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.owner = _user("owner@example.com")
        self.collab = _user("collab@example.com")
        self.regular = _user("regular@example.com")
        self.replier = _user("replier@example.com")

        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )

        starts = timezone.now() + timedelta(days=10)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="camp",
            title="Camp Beskydy",
            starts_at=starts,
            ends_at=starts + timedelta(days=3),
            status=Event.STATUS_PUBLISHED,
        )
        EventCollaborator.objects.create(
            event=self.event, user=self.collab, added_by=self.owner
        )

        self.topic = Topic.objects.create(
            parent_type=Topic.PARENT_EVENT,
            parent_id=self.event.pk,
            author=self.regular,
            title="Kdo veze karimatky?",
            body="",
        )

    def test_owner_and_collaborator_mandatory_bypass_optout(self):
        """Vypnu owner + collab opt-out. Pořád musí dostat notifikaci
        (event mandatory bypass), ale ``regular`` (topic autor, ne
        creator) by opt-out respektoval — když si ho vypne, přijde
        o notifikaci."""
        self.owner.notify_on_discussion_reply = False
        self.owner.save(update_fields=["notify_on_discussion_reply"])
        self.collab.notify_on_discussion_reply = False
        self.collab.save(update_fields=["notify_on_discussion_reply"])

        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.replier, body="Já."
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        # Owner + collab mandatory → přijde přes opt-out.
        self.assertIn("owner@example.com", recipients)
        self.assertIn("collab@example.com", recipients)
        # Topic autor (regular) není creator, opt-out ho ochrání —
        # ale defaultně má True, takže dostane.
        self.assertIn("regular@example.com", recipients)

        bell_recipients = set(
            Notification.objects.filter(
                kind=Notification.KIND_DISCUSSION_REPLY,
                payload__comment_id=new.pk,
            ).values_list("recipient__email", flat=True)
        )
        self.assertIn("owner@example.com", bell_recipients)
        self.assertIn("collab@example.com", bell_recipients)

    def test_commenter_never_gets_self_ping_even_if_creator(self):
        """Když sám organizátor napíše reply, sám sebe nedostane
        (self-ping check je silnější než mandatory)."""
        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.owner, body="Fajn."
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertNotIn("owner@example.com", recipients)
        # Collab pořád notifikován, topic autor taky.
        self.assertIn("collab@example.com", recipients)
        self.assertIn("regular@example.com", recipients)

    def test_no_prior_commenters_still_notifies_creator(self):
        """Fresh event topic bez předchozích replies — první reply
        rovnou notifikuje owner + collab i topic autora."""
        mail.outbox.clear()
        new = Comment.objects.create(
            topic=self.topic, author=self.replier, body="?"
        )

        send_comment_notification(new)

        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertEqual(
            recipients,
            {"owner@example.com", "collab@example.com", "regular@example.com"},
        )
