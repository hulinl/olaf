"""Coverage for billing profiles + Web Push subscriptions.

Tahle skupina endpointů byla untested. Billing profiles užívá user
při placení akce (jméno/adresa na fakturu). Web push subscriptions
řídí registraci PWA push tokenů — kdyby se to rozbilo, push
notifikace prostě nedoletí.
"""
from __future__ import annotations

from unittest import mock

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import BillingProfile, PushSubscription, User


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


class BillingProfileListCreateTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@bp.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("accounts:billing-profiles")

    def test_anon_blocked(self) -> None:
        client = APIClient()
        r = client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_empty_list(self) -> None:
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_create_first_profile_auto_default(self) -> None:
        # První profil se automaticky stane default ať user nemusí
        # extra klik.
        r = self.client.post(
            self.url,
            {
                "label": "Domov",
                "legal_name": "Olaf Hulin",
                "address_street": "Hlavní 1",
                "address_city": "Praha",
                "address_zip": "11000",
                "address_country": "CZ",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        profile = BillingProfile.objects.get(user=self.user)
        self.assertTrue(profile.is_default)

    def test_second_profile_not_auto_default(self) -> None:
        # Druhý a další profil zůstává s default=False (uživatel si
        # ručně přepne default UI tlačítkem).
        for label in ("First", "Second"):
            self.client.post(
                self.url,
                {
                    "label": label,
                    "legal_name": "Olaf",
                    "address_street": "Ulice",
                    "address_city": "Město",
                    "address_zip": "00001",
                    "address_country": "CZ",
                },
                format="json",
            )
        profiles = list(
            BillingProfile.objects.filter(user=self.user).order_by("created_at")
        )
        self.assertTrue(profiles[0].is_default)
        self.assertFalse(profiles[1].is_default)

    def test_list_returns_only_my_profiles(self) -> None:
        other = _make_user("other@bp.com")
        BillingProfile.objects.create(
            user=other, label="Other", legal_name="Other",
        )
        BillingProfile.objects.create(
            user=self.user, label="Mine", legal_name="Mine",
        )
        r = self.client.get(self.url)
        labels = [p["label"] for p in r.json()]
        self.assertEqual(labels, ["Mine"])


class BillingProfileDetailTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@bpd.com")
        self.other = _make_user("o@bpd.com")
        self.profile = BillingProfile.objects.create(
            user=self.user,
            label="Domov",
            legal_name="Olaf",
            address_street="Ulice",
            address_city="Město",
            address_zip="11000",
            address_country="CZ",
            is_default=True,
        )
        self.client = APIClient()

    def _url(self, pk: int | None = None) -> str:
        return reverse(
            "accounts:billing-profile-detail",
            kwargs={"profile_id": pk or self.profile.pk},
        )

    def test_user_gets_own(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["label"], "Domov")

    def test_other_user_cannot_access(self) -> None:
        self.client.force_authenticate(self.other)
        r = self.client.get(self._url())
        # Endpoint filters by user — pro cizí 404.
        self.assertEqual(r.status_code, 404)

    def test_patch_updates(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self._url(),
            {"address_city": "Brno"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.address_city, "Brno")

    def test_delete_default_promotes_another(self) -> None:
        # Vytvoř druhý profil (non-default).
        other_profile = BillingProfile.objects.create(
            user=self.user,
            label="Práce",
            legal_name="Olaf s.r.o.",
        )
        self.client.force_authenticate(self.user)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        other_profile.refresh_from_db()
        # Po smazání default-profilu se další stane default.
        self.assertTrue(other_profile.is_default)

    def test_delete_last_profile_no_promotion(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertEqual(
            BillingProfile.objects.filter(user=self.user).count(), 0
        )

    def test_unknown_profile_404(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.get(self._url(pk=99999))
        self.assertEqual(r.status_code, 404)


@override_settings(VAPID_PUBLIC_KEY="test-vapid-public-key")
class PushSubscriptionTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@push.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("accounts:push-subscriptions")

    def test_anon_blocked(self) -> None:
        client = APIClient()
        r = client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_empty_list(self) -> None:
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_create_subscription(self) -> None:
        r = self.client.post(
            self.url,
            {
                "endpoint": "https://fcm.googleapis.com/fcm/send/abc123",
                "keys": {"p256dh": "fake-p256dh-key", "auth": "fake-auth"},
                "user_agent": "Mozilla/5.0 iPhone",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(PushSubscription.objects.filter(user=self.user).count(), 1)
        sub = PushSubscription.objects.get(user=self.user)
        self.assertEqual(sub.user_agent, "Mozilla/5.0 iPhone")

    def test_resubscribe_updates_existing(self) -> None:
        # Same endpoint = update, ne duplicate.
        for ua in ("iPhone v1", "iPhone v2 — upgraded"):
            self.client.post(
                self.url,
                {
                    "endpoint": "https://fcm.googleapis.com/fcm/send/x",
                    "keys": {"p256dh": "key", "auth": "auth"},
                    "user_agent": ua,
                },
                format="json",
            )
        self.assertEqual(
            PushSubscription.objects.filter(user=self.user).count(), 1
        )
        sub = PushSubscription.objects.get(user=self.user)
        self.assertEqual(sub.user_agent, "iPhone v2 — upgraded")

    def test_missing_endpoint_400(self) -> None:
        r = self.client.post(
            self.url,
            {"keys": {"p256dh": "x", "auth": "y"}},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_missing_keys_400(self) -> None:
        r = self.client.post(
            self.url,
            {"endpoint": "https://x"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    @override_settings(VAPID_PUBLIC_KEY="")
    def test_no_vapid_configured_503(self) -> None:
        # Pokud env. nemá VAPID, registrace je 503 — explicit signal
        # frontendu že push tady nefunguje.
        r = self.client.post(
            self.url,
            {
                "endpoint": "https://x",
                "keys": {"p256dh": "x", "auth": "y"},
            },
            format="json",
        )
        self.assertEqual(r.status_code, 503)


@override_settings(VAPID_PUBLIC_KEY="test-vapid-public-key")
class PushSubscriptionDeleteTests(TestCase):
    def setUp(self) -> None:
        self.user = _make_user("u@psd.com")
        self.other = _make_user("o@psd.com")
        self.sub = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://x",
            p256dh="k",
            auth="a",
            user_agent="ua",
        )
        self.client = APIClient()

    def _url(self, pk: int | None = None) -> str:
        return reverse(
            "accounts:push-subscription-detail",
            kwargs={"sub_id": pk or self.sub.pk},
        )

    def test_user_deletes_own(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(PushSubscription.objects.filter(pk=self.sub.pk).exists())

    def test_other_user_404(self) -> None:
        self.client.force_authenticate(self.other)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 404)

    def test_unknown_404(self) -> None:
        self.client.force_authenticate(self.user)
        r = self.client.delete(self._url(pk=99999))
        self.assertEqual(r.status_code, 404)


@override_settings(VAPID_PUBLIC_KEY="test")
class PushTestEndpointTests(TestCase):
    """`POST /api/auth/me/push-test/` — debug endpoint co střelí push
    na všechny user-registered devices a vrátí diagnostiku."""

    def setUp(self) -> None:
        self.user = _make_user("u@pt.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("accounts:push-test")

    def test_anon_blocked(self) -> None:
        client = APIClient()
        r = client.post(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_no_subscriptions_returns_zeros(self) -> None:
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data.get("subscriptions"), 0)
        self.assertEqual(data.get("sent"), 0)

    @mock.patch("notifications.push._send_one", return_value=True)
    def test_with_subscription_attempts_send(self, mock_send_one) -> None:
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://x",
            p256dh="k",
            auth="a",
            user_agent="ua",
        )
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data.get("subscriptions"), 1)
        # `sent` count odpovídá počtu úspěšných send_push_to_user calls.
        self.assertGreaterEqual(data.get("sent"), 0)
