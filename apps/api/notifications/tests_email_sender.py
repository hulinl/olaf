"""Coverage pro `send_branded_email` — shared multipart sender.

Locks in že:
- text + HTML jsou obě připojené (multipart/alternative)
- HTML obsahuje brand mark + Sunrise CTA tlačítko (přes _base.html)
- context defaults (`site_url`, `brand_logo_url`) jsou aplikované
"""
from __future__ import annotations

from django.core import mail
from django.test import TestCase, override_settings

from .email_sender import send_branded_email


@override_settings(FRONTEND_URL="https://olaf.events")
class SendBrandedEmailTests(TestCase):
    def setUp(self) -> None:
        mail.outbox.clear()

    def test_sends_text_and_html_alternatives(self) -> None:
        # verify_email má .txt aj .html šablonu — použijem ji.
        send_branded_email(
            subject="Test",
            template_base="emails/verify_email",
            context={
                "user": type("U", (), {"first_name": "Marta"})(),
                "link": "https://example.com/verify/abc",
                "expires_hours": 24,
            },
            recipient_list=["recipient@x.com"],
        )
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        # Plain text body je v main body.
        self.assertIn("Ahoj Marta", msg.body)
        self.assertIn("https://example.com/verify/abc", msg.body)
        # HTML alternative je připojená.
        self.assertEqual(len(msg.alternatives), 1)
        html, mime = msg.alternatives[0]
        self.assertEqual(mime, "text/html")
        self.assertIn("Ahoj Marta", html)
        # Brand mark URL (z _base.html) přítomný.
        self.assertIn("icon-192.png", html)
        # Sunrise amber CTA tlačítko.
        self.assertIn("#f59e0b", html)
        # Email footer.
        self.assertIn("Aplikace olaf", html)
        self.assertIn("BIfactory", html)

    def test_subject_and_recipient(self) -> None:
        send_branded_email(
            subject="Hello world",
            template_base="emails/verify_email",
            context={
                "user": type("U", (), {"first_name": "X"})(),
                "link": "https://example.com",
                "expires_hours": 24,
            },
            recipient_list=["a@x.com", "b@x.com"],
        )
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, "Hello world")
        self.assertEqual(msg.to, ["a@x.com", "b@x.com"])

    def test_site_url_injected_into_context(self) -> None:
        # `site_url` se použije v footer linku.
        send_branded_email(
            subject="t",
            template_base="emails/verify_email",
            context={
                "user": type("U", (), {"first_name": "X"})(),
                "link": "x",
                "expires_hours": 1,
            },
            recipient_list=["x@x.com"],
        )
        html = mail.outbox[0].alternatives[0][0]
        self.assertIn("olaf.events", html)

    @override_settings(FRONTEND_URL="https://staging.olaf.events")
    def test_brand_logo_url_uses_frontend_url_base(self) -> None:
        send_branded_email(
            subject="t",
            template_base="emails/verify_email",
            context={
                "user": type("U", (), {"first_name": "X"})(),
                "link": "x",
                "expires_hours": 1,
            },
            recipient_list=["x@x.com"],
        )
        html = mail.outbox[0].alternatives[0][0]
        # Brand logo loaded from staging URL.
        self.assertIn("https://staging.olaf.events/icon-192.png", html)
