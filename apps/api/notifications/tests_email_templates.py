"""Per-template smoke tests pro branded e-maily.

Cíl: každá .html šablona renderuje bez exception + obsahuje očekávané
brand prvky (logo, CTA button, footer) + key content z contextu.
Locks in že rename pole / drop pole nelajzne tichého šumu.
"""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from .email_sender import send_branded_email


def _fake_user(first_name="Marta", email="marta@x.com"):
    return SimpleNamespace(first_name=first_name, email=email)


def _fake_event(title="Spring Camp", slug="spring-camp", ws_slug="olaf"):
    starts = timezone.now() + timedelta(days=14)
    return SimpleNamespace(
        title=title,
        slug=slug,
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        location_text="Lysá hora",
        meeting_point_text="parkoviště Ostravice",
        workspace=SimpleNamespace(
            slug=ws_slug,
            name="Olaf Adventures",
            payment_iban="CZ65 0800 0000 1920 0014 5399",
            payment_bank_name="ČSOB",
            payment_due_days=14,
        ),
    )


def _fake_rsvp(user, event, payment_status="pending"):
    return SimpleNamespace(
        user=user,
        event=event,
        status="yes",
        payment_status=payment_status,
        payment_due_amount="2500.00",
        payment_currency="CZK",
        variable_symbol="20240001",
    )


@override_settings(FRONTEND_URL="https://olaf.events")
class TemplateSmokeTests(TestCase):
    def setUp(self) -> None:
        mail.outbox.clear()

    def _render(self, template_base: str, context: dict) -> tuple[str, str]:
        """Helper: send + return (text, html)."""
        send_branded_email(
            subject="Test",
            template_base=template_base,
            context=context,
            recipient_list=["x@x.com"],
        )
        msg = mail.outbox[-1]
        html = msg.alternatives[0][0]
        return msg.body, html

    def test_verify_email(self) -> None:
        text, html = self._render(
            "emails/verify_email",
            {"user": _fake_user(), "link": "https://x.com/verify", "expires_hours": 24},
        )
        for body in (text, html):
            self.assertIn("Marta", body)
            self.assertIn("verify", body.lower())
        # HTML-only assertions.
        self.assertIn("icon-192.png", html)  # brand mark
        self.assertIn("Potvrdit", html)  # CTA label
        self.assertIn("Aplikace olaf", html)  # footer

    def test_password_reset(self) -> None:
        text, html = self._render(
            "emails/password_reset",
            {"user": _fake_user(), "link": "https://x.com/reset", "expires_hours": 1},
        )
        for body in (text, html):
            self.assertIn("Marta", body)
            self.assertIn("obnov", body.lower())
        self.assertIn("Nastavit nové heslo", html)

    def test_rsvp_confirmation_with_payment(self) -> None:
        event = _fake_event()
        text, html = self._render(
            "emails/rsvp_confirmation",
            {
                "user": _fake_user(),
                "event": event,
                "rsvp": _fake_rsvp(_fake_user(), event),
                "status": "yes",
                "event_url": "https://x.com/spring-camp",
                "workspace": event.workspace,
                "event_when": "pátek 16. 5. 2026 v 14:00",
            },
        )
        # Core content v obou.
        for body in (text, html):
            self.assertIn("Marta", body)
            self.assertIn("Spring Camp", body)
            self.assertIn("Lysá hora", body)
            self.assertIn("20240001", body)  # variable symbol
            self.assertIn("2500.00", body)
        # HTML payment card.
        self.assertIn("Pokyny k platbě", html)
        self.assertIn("CZ65", html)  # IBAN

    def test_rsvp_confirmation_without_payment(self) -> None:
        # status=yes ale payment je paid → žádný payment card.
        event = _fake_event()
        text, html = self._render(
            "emails/rsvp_confirmation",
            {
                "user": _fake_user(),
                "event": event,
                "rsvp": _fake_rsvp(_fake_user(), event, payment_status="paid"),
                "status": "yes",
                "event_url": "https://x.com/spring-camp",
                "workspace": event.workspace,
                "event_when": "pátek 16. 5. 2026 v 14:00",
            },
        )
        self.assertNotIn("Pokyny k platbě", html)

    def test_rsvp_promoted(self) -> None:
        event = _fake_event()
        text, html = self._render(
            "emails/rsvp_promoted",
            {
                "user": _fake_user(),
                "event": event,
                "event_url": "https://x.com/spring-camp",
                "workspace": event.workspace,
                "event_when": "pátek 16. 5. 2026 v 14:00",
            },
        )
        for body in (text, html):
            self.assertIn("Marta", body)
            self.assertIn("Spring Camp", body)
            self.assertIn("uvolnilo", body.lower())

    def test_event_cancelled_with_reason(self) -> None:
        event = _fake_event()
        text, html = self._render(
            "emails/event_cancelled",
            {
                "user": _fake_user(),
                "event": event,
                "reason": "Velká bouřka.",
                "workspace": event.workspace,
                "event_when": "pátek 16. 5. 2026 v 14:00",
            },
        )
        for body in (text, html):
            self.assertIn("zrušena", body.lower())
            self.assertIn("Velká bouřka", body)

    def test_event_cancelled_without_reason(self) -> None:
        event = _fake_event()
        _text, html = self._render(
            "emails/event_cancelled",
            {
                "user": _fake_user(),
                "event": event,
                "reason": "",
                "workspace": event.workspace,
                "event_when": "pátek 16. 5. 2026 v 14:00",
            },
        )
        # Žádný reason highlight box (no "Důvod" header).
        self.assertNotIn("Důvod", html)

    def test_workspace_invitation(self) -> None:
        invitation = SimpleNamespace(email="newbie@x.com")
        workspace = SimpleNamespace(name="Olaf Adventures", bio="Outdoor parta z Beskyd")
        text, html = self._render(
            "emails/workspace_invitation",
            {
                "invitation": invitation,
                "workspace": workspace,
                "accept_url": "https://x.com/accept/abc",
                "invited_by_name": "Olaf Hulin",
            },
        )
        for body in (text, html):
            self.assertIn("Olaf Hulin", body)
            self.assertIn("Olaf Adventures", body)
        # HTML link is button-styled.
        self.assertIn("Přijmout pozvánku", html)
        # Bio render.
        self.assertIn("Outdoor parta z Beskyd", html)

    def test_workspace_invitation_anonymous_inviter(self) -> None:
        # When `invited_by_name` is empty, falls back to „někdo".
        invitation = SimpleNamespace(email="newbie@x.com")
        workspace = SimpleNamespace(name="Olaf Adventures", bio="")
        text, html = self._render(
            "emails/workspace_invitation",
            {
                "invitation": invitation,
                "workspace": workspace,
                "accept_url": "https://x.com/accept/abc",
                "invited_by_name": "",
            },
        )
        for body in (text, html):
            self.assertIn("někdo", body)

    def test_workspace_broadcast_preserves_owner_body(self) -> None:
        workspace = SimpleNamespace(name="Olaf Adventures")
        text, html = self._render(
            "emails/workspace_broadcast",
            {
                "subject": "Důležité info",
                "body": "Ahoj všem,\n\nzměna místa srazu — Mohelnice.",
                "author_name": "Olaf Hulin",
                "workspace": workspace,
            },
        )
        for body in (text, html):
            self.assertIn("Mohelnice", body)
            self.assertIn("Olaf Hulin", body)
        # HTML zachovává newlines přes white-space:pre-wrap.
        self.assertIn("white-space:pre-wrap", html)

    def test_checklist_reminder_to_participants(self) -> None:
        event = _fake_event()
        item = SimpleNamespace(
            title="Vezmi si pláštěnku",
            description="Předpověď slibuje bouřku.",
            pk=1,
        )
        text, html = self._render(
            "events/checklist_reminder",
            {
                "item": item,
                "event": event,
                "recipient": _fake_user(),
                "cockpit_url": "https://x.com/cockpit",
                "is_participants": True,
            },
        )
        for body in (text, html):
            self.assertIn("Vezmi si pláštěnku", body)
            self.assertIn("organizátor" if body == text else "organizátor", body)

    def test_checklist_reminder_to_owner(self) -> None:
        event = _fake_event()
        item = SimpleNamespace(
            title="Pozvánky rozeslat",
            description="",
            pk=1,
        )
        _text, html = self._render(
            "events/checklist_reminder",
            {
                "item": item,
                "event": event,
                "recipient": _fake_user(first_name="Olaf"),
                "cockpit_url": "https://x.com/cockpit",
                "is_participants": False,
            },
        )
        self.assertIn("připomínka", html.lower())

    def test_discussion_comment_added(self) -> None:
        text, html = self._render(
            "discussions/comment_added",
            {
                "topic": SimpleNamespace(
                    title="Sraz v 9?",
                    author=SimpleNamespace(first_name="Olaf"),
                ),
                "comment": SimpleNamespace(body="Souhlas, 9:00 sedí."),
                "topic_url": "https://x.com/topic/42",
                "parent_label": "akce Spring Camp",
                "author_name": "Marta Member",
            },
        )
        for body in (text, html):
            self.assertIn("Olaf", body)  # recipient
            self.assertIn("Marta Member", body)
            self.assertIn("Sraz v 9", body)
            self.assertIn("9:00 sedí", body)

    def test_discussion_topic_announced(self) -> None:
        text, html = self._render(
            "discussions/topic_announced",
            {
                "topic": SimpleNamespace(
                    title="Co s sebou?", body="Plné batohy, gear list v cockpitu.",
                ),
                "topic_url": "https://x.com/topic/77",
                "parent_label": "akce Spring Camp",
                "recipient": _fake_user(),
                "author_name": "Olaf Hulin",
            },
        )
        for body in (text, html):
            self.assertIn("Marta", body)
            self.assertIn("Co s sebou", body)
            self.assertIn("akce Spring Camp", body)


@override_settings(FRONTEND_URL="https://olaf.events")
class ReplyToTests(TestCase):
    def setUp(self) -> None:
        mail.outbox.clear()

    def test_reply_to_attached(self) -> None:
        send_branded_email(
            subject="Test",
            template_base="emails/verify_email",
            context={
                "user": _fake_user(),
                "link": "https://x.com/verify",
                "expires_hours": 1,
            },
            recipient_list=["x@x.com"],
            reply_to=["owner@olaf.events"],
        )
        self.assertEqual(mail.outbox[0].reply_to, ["owner@olaf.events"])

    def test_no_reply_to_default(self) -> None:
        send_branded_email(
            subject="Test",
            template_base="emails/verify_email",
            context={
                "user": _fake_user(),
                "link": "https://x.com/verify",
                "expires_hours": 1,
            },
            recipient_list=["x@x.com"],
        )
        # Bez reply_to kwarg je field prázdný/None.
        self.assertEqual(mail.outbox[0].reply_to, [])
