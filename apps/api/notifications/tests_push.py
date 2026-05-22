"""Web Push delivery logic — `_send_one` cleanup + `send_push_to_user`
fan-out.

`_send_one` má kritickou cleanup behavior — když push service vrátí
404/410 (browser uninstalled / user revoked permission), subscription
se má smazat. Bez toho fan-out dál posílá na mrtvé endpointy.

`send_push_to_user` musí gracefully fungovat s 0 subscriptions a
správně počítat sent.
"""
from __future__ import annotations

from unittest import mock

import pywebpush
from django.test import TestCase, override_settings

from accounts.models import PushSubscription, User

from .push import _send_one, send_push_to_user


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


@override_settings(
    VAPID_PUBLIC_KEY="test-public",
    VAPID_PRIVATE_KEY="dGVzdC1wcml2YXRl",  # base64 "test-private"
    VAPID_SUBJECT="mailto:test@olaf.events",
)
class SendOneTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@p.com")
        self.sub = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/x",
            p256dh="key",
            auth="auth",
            user_agent="ua",
        )

    @mock.patch("notifications.push.webpush")
    def test_successful_send_returns_true(self, mock_webpush) -> None:
        result = _send_one(self.sub, {"title": "t", "body": "b"})
        self.assertTrue(result)
        mock_webpush.assert_called_once()
        # Subscription pořád existuje.
        self.assertTrue(
            PushSubscription.objects.filter(pk=self.sub.pk).exists()
        )

    @mock.patch("notifications.push.webpush")
    def test_404_response_deletes_subscription(self, mock_webpush) -> None:
        # Push service: endpoint je dead (browser uninstalled).
        response_mock = mock.Mock(status_code=404)
        exc = pywebpush.WebPushException(
            message="Gone", response=response_mock
        )
        mock_webpush.side_effect = exc
        result = _send_one(self.sub, {"title": "t", "body": "b"})
        self.assertFalse(result)
        # Subscription byla smazána (cleanup).
        self.assertFalse(
            PushSubscription.objects.filter(pk=self.sub.pk).exists()
        )

    @mock.patch("notifications.push.webpush")
    def test_410_response_deletes_subscription(self, mock_webpush) -> None:
        # 410 Gone — stejné chování jako 404.
        response_mock = mock.Mock(status_code=410)
        exc = pywebpush.WebPushException(
            message="Gone", response=response_mock
        )
        mock_webpush.side_effect = exc
        result = _send_one(self.sub, {"title": "t", "body": "b"})
        self.assertFalse(result)
        self.assertFalse(
            PushSubscription.objects.filter(pk=self.sub.pk).exists()
        )

    @mock.patch("notifications.push.webpush")
    def test_500_error_keeps_subscription(self, mock_webpush) -> None:
        # 5xx je transient — subscription NESMÍME smazat.
        response_mock = mock.Mock(status_code=500)
        exc = pywebpush.WebPushException(
            message="Server error", response=response_mock
        )
        mock_webpush.side_effect = exc
        result = _send_one(self.sub, {"title": "t", "body": "b"})
        self.assertFalse(result)
        self.assertTrue(
            PushSubscription.objects.filter(pk=self.sub.pk).exists()
        )

    @mock.patch("notifications.push.webpush")
    def test_unexpected_error_keeps_subscription(self, mock_webpush) -> None:
        mock_webpush.side_effect = RuntimeError("boom")
        result = _send_one(self.sub, {"title": "t", "body": "b"})
        self.assertFalse(result)
        # Generic exception — neclean-upujem (může to být náš bug ne push
        # service rejection).
        self.assertTrue(
            PushSubscription.objects.filter(pk=self.sub.pk).exists()
        )


@override_settings(
    VAPID_PUBLIC_KEY="test-public",
    VAPID_PRIVATE_KEY="dGVzdC1wcml2YXRl",
    VAPID_SUBJECT="mailto:test@olaf.events",
)
class SendPushToUserTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@spu.com")

    def test_no_subscriptions_returns_zero(self) -> None:
        result = send_push_to_user(
            self.user, title="t", body="b", url="/dashboard"
        )
        self.assertEqual(result, 0)

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_no_vapid_returns_zero(self) -> None:
        # Bez VAPID configu vrací 0 i kdyby user měl subscriptions —
        # signal pro caller že push není zapnutý.
        PushSubscription.objects.create(
            user=self.user, endpoint="https://x",
            p256dh="k", auth="a", user_agent="ua",
        )
        result = send_push_to_user(self.user, title="t", body="b")
        self.assertEqual(result, 0)

    @mock.patch("notifications.push._send_one", return_value=True)
    def test_counts_successful_sends(self, mock_send) -> None:
        for i in range(3):
            PushSubscription.objects.create(
                user=self.user, endpoint=f"https://x{i}",
                p256dh="k", auth="a", user_agent="ua",
            )
        result = send_push_to_user(self.user, title="t", body="b")
        self.assertEqual(result, 3)

    @mock.patch("notifications.push._send_one")
    def test_partial_failure_counted_correctly(self, mock_send) -> None:
        # 3 subs, 2 succeed, 1 fails → count = 2.
        mock_send.side_effect = [True, False, True]
        for i in range(3):
            PushSubscription.objects.create(
                user=self.user, endpoint=f"https://x{i}",
                p256dh="k", auth="a", user_agent="ua",
            )
        result = send_push_to_user(self.user, title="t", body="b")
        self.assertEqual(result, 2)

    @mock.patch("notifications.push._send_one", return_value=True)
    def test_passes_payload_to_send_one(self, mock_send) -> None:
        PushSubscription.objects.create(
            user=self.user, endpoint="https://x",
            p256dh="k", auth="a", user_agent="ua",
        )
        send_push_to_user(
            self.user,
            title="Hello",
            body="World",
            url="/abc",
            tag="reminder",
        )
        # _send_one byl volaný s payloadem obsahujícím všechny pole.
        args, _ = mock_send.call_args
        _sub, payload = args
        self.assertEqual(payload["title"], "Hello")
        self.assertEqual(payload["body"], "World")
        self.assertEqual(payload["url"], "/abc")
        self.assertEqual(payload["tag"], "reminder")

    @mock.patch("notifications.push._send_one", return_value=True)
    def test_tag_omitted_when_none(self, mock_send) -> None:
        PushSubscription.objects.create(
            user=self.user, endpoint="https://x",
            p256dh="k", auth="a", user_agent="ua",
        )
        send_push_to_user(self.user, title="t", body="b")
        args, _ = mock_send.call_args
        _sub, payload = args
        self.assertNotIn("tag", payload)
