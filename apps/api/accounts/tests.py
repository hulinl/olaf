from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import EmailVerificationToken, PasswordResetToken, User


class SignupTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.url = reverse("accounts:signup")
        self.payload = {
            "email": "Marta@example.com",
            "password": "alpine-hike-2026",
            "first_name": "Marta",
            "last_name": "Member",
        }

    def test_creates_user_and_sends_verification(self) -> None:
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="marta@example.com")
        self.assertFalse(user.email_verified)
        self.assertEqual(user.first_name, "Marta")
        self.assertTrue(user.check_password("alpine-hike-2026"))
        self.assertEqual(EmailVerificationToken.objects.filter(user=user).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Verify your OLAF account", mail.outbox[0].subject)

    def test_rejects_short_password(self) -> None:
        self.payload["password"] = "short1"
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", resp.json())

    def test_rejects_password_without_digit(self) -> None:
        self.payload["password"] = "no-digits-here"
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", resp.json())

    def test_rejects_duplicate_email(self) -> None:
        User.objects.create_user(
            email="marta@example.com",
            password="alpine-hike-2026",
            first_name="Marta",
            last_name="Member",
        )
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class EmailVerificationTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="marta@example.com",
            password="alpine-hike-2026",
            first_name="Marta",
            last_name="Member",
        )
        self.token = EmailVerificationToken.objects.create(user=self.user)
        self.url = reverse("accounts:verify")

    def test_verify_marks_user_verified(self) -> None:
        resp = self.client.post(self.url, {"token": self.token.token}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.token.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertIsNotNone(self.token.used_at)

    def test_invalid_token_rejected(self) -> None:
        resp = self.client.post(self.url, {"token": "not-a-real-token"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_used_token_rejected(self) -> None:
        self.token.mark_used()
        resp = self.client.post(self.url, {"token": self.token.token}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="marta@example.com",
            password="alpine-hike-2026",
            first_name="Marta",
            last_name="Member",
        )
        self.url = reverse("accounts:login")

    def test_blocks_unverified_user(self) -> None:
        resp = self.client.post(
            self.url,
            {"email": "marta@example.com", "password": "alpine-hike-2026"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticates_verified_user(self) -> None:
        self.user.email_verified = True
        self.user.save()
        resp = self.client.post(
            self.url,
            {"email": "marta@example.com", "password": "alpine-hike-2026"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["email"], "marta@example.com")

    def test_rejects_bad_password(self) -> None:
        self.user.email_verified = True
        self.user.save()
        resp = self.client.post(
            self.url,
            {"email": "marta@example.com", "password": "wrong-password-1"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordResetTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="marta@example.com",
            password="alpine-hike-2026",
            first_name="Marta",
            last_name="Member",
        )
        self.user.email_verified = True
        self.user.save()
        self.request_url = reverse("accounts:password-reset-request")
        self.confirm_url = reverse("accounts:password-reset-confirm")

    def test_reset_request_sends_email(self) -> None:
        resp = self.client.post(self.request_url, {"email": "marta@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Reset your OLAF password", mail.outbox[0].subject)
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user).count(), 1)

    def test_reset_request_for_unknown_email_returns_200(self) -> None:
        resp = self.client.post(self.request_url, {"email": "ghost@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_reset_confirm_updates_password(self) -> None:
        token = PasswordResetToken.objects.create(user=self.user)
        resp = self.client.post(
            self.confirm_url,
            {"token": token.token, "password": "new-secret-9999"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-secret-9999"))

    def test_reset_confirm_rejects_used_token(self) -> None:
        token = PasswordResetToken.objects.create(user=self.user)
        token.mark_used()
        resp = self.client.post(
            self.confirm_url,
            {"token": token.token, "password": "new-secret-9999"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class MeTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="marta@example.com",
            password="alpine-hike-2026",
            first_name="Marta",
            last_name="Member",
        )
        self.user.email_verified = True
        self.user.save()
        self.url = reverse("accounts:me")

    def test_me_requires_auth(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_me_returns_current_user(self) -> None:
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["email"], "marta@example.com")
        self.assertTrue(resp.json()["email_verified"])
