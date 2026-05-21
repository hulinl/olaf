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
        self.assertIn("Potvrď svůj olaf účet", mail.outbox[0].subject)

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
        self.assertIn("Obnovení hesla", mail.outbox[0].subject)
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
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self) -> None:
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["email"], "marta@example.com")
        self.assertTrue(resp.json()["email_verified"])


class ProfileCompletionTests(TestCase):
    """The User.profile_completion property + its serialized form
    drive the "doplň profil" nudge in the UI. Keep this honest so the
    badge doesn't disappear (or stick around) on the wrong accounts."""

    def setUp(self) -> None:
        # Default test user has name + email but no phone, no address.
        self.user = User.objects.create_user(
            email="incomplete@example.com",
            password="alpine-hike-2026",
            first_name="In",
            last_name="Complete",
        )

    def test_brand_new_user_missing_phone_and_address(self) -> None:
        pc = self.user.profile_completion
        self.assertFalse(pc["is_complete"])
        keys = [m["key"] for m in pc["missing"]]
        self.assertIn("phone", keys)
        self.assertIn("address", keys)
        self.assertNotIn("first_name", keys)
        self.assertNotIn("last_name", keys)

    def test_blank_first_name_flagged(self) -> None:
        u = User.objects.create_user(
            email="noname@example.com",
            password="alpine-hike-2026",
            first_name="",
            last_name="",
        )
        pc = u.profile_completion
        keys = [m["key"] for m in pc["missing"]]
        self.assertIn("first_name", keys)
        self.assertIn("last_name", keys)

    def test_legacy_single_line_address_satisfies(self) -> None:
        self.user.phone = "+420 123 456 789"
        self.user.address = "Beskydská 7, Frýdek"
        self.user.save()
        pc = self.user.profile_completion
        self.assertTrue(pc["is_complete"])

    def test_structured_address_satisfies(self) -> None:
        self.user.phone = "+420 123 456 789"
        self.user.address_street = "Beskydská 7"
        self.user.address_city = "Frýdek"
        self.user.address_zip = "73801"
        self.user.save()
        pc = self.user.profile_completion
        self.assertTrue(pc["is_complete"])

    def test_partial_structured_address_does_not_satisfy(self) -> None:
        # Street + city but no ZIP — still considered incomplete.
        self.user.phone = "+420 123"
        self.user.address_street = "Beskydská 7"
        self.user.address_city = "Frýdek"
        self.user.save()
        pc = self.user.profile_completion
        keys = [m["key"] for m in pc["missing"]]
        self.assertIn("address", keys)

    def test_me_endpoint_returns_completion(self) -> None:
        """Frontend reads `profile_completion` off the /me payload."""
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_authenticate(self.user)
        resp = c.get("/api/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("profile_completion", resp.json())
        self.assertFalse(resp.json()["profile_completion"]["is_complete"])

    def test_whitespace_only_phone_does_not_count(self) -> None:
        self.user.phone = "   "
        self.user.address = "Real address"
        self.user.save()
        keys = [m["key"] for m in self.user.profile_completion["missing"]]
        self.assertIn("phone", keys)


class NotionIntegrationTests(TestCase):
    """Covers the user-scoped Notion token storage endpoint.

    Token confidentiality is the load-bearing property here:
    - never echoed back to the client
    - encrypted at rest (test by inspecting the DB column)
    - decryptable via the helper so the backend can actually use it
    """

    def setUp(self) -> None:
        from rest_framework.test import APIClient

        self.user = User.objects.create_user(
            email="alice@notion.example.com",
            password="alpine-hike-2026",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/auth/me/integrations/notion/"

    def test_anonymous_blocked(self) -> None:
        from rest_framework.test import APIClient

        resp = APIClient().get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_initially_disconnected(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.json()["connected"])

    def test_put_stores_encrypted_and_connected_flag_flips(self) -> None:
        from .integrations import decrypt_token

        raw = "secret_" + "a" * 50
        resp = self.client.put(self.url, {"token": raw}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["connected"])

        self.user.refresh_from_db()
        ciphertext = self.user.notion_integration_token_encrypted
        # Must NOT be plaintext.
        self.assertNotIn(raw, ciphertext)
        self.assertTrue(ciphertext)
        # Must decrypt back to the original.
        self.assertEqual(decrypt_token(ciphertext), raw)

    def test_put_response_never_contains_token(self) -> None:
        raw = "secret_" + "b" * 50
        resp = self.client.put(self.url, {"token": raw}, format="json")
        body = resp.json()
        self.assertNotIn("token", body)
        self.assertNotIn(raw, str(body))

    def test_get_never_returns_token(self) -> None:
        from .integrations import encrypt_token

        self.user.notion_integration_token_encrypted = encrypt_token(
            "secret_" + "c" * 50
        )
        self.user.save()
        resp = self.client.get(self.url)
        body = resp.json()
        self.assertEqual(set(body.keys()), {"connected"})
        self.assertTrue(body["connected"])

    def test_put_rejects_empty(self) -> None:
        resp = self.client.put(self.url, {"token": ""}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_wrong_prefix(self) -> None:
        resp = self.client.put(
            self.url, {"token": "bearer_xxx_not_notion"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_too_short(self) -> None:
        resp = self.client.put(
            self.url, {"token": "secret_short"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepts_ntn_prefix(self) -> None:
        # Notion issues `ntn_…` tokens for new integrations alongside
        # the older `secret_…` form. Both should be accepted.
        raw = "ntn_" + "x" * 50
        resp = self.client.put(self.url, {"token": raw}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_delete_clears_token(self) -> None:
        from .integrations import encrypt_token

        self.user.notion_integration_token_encrypted = encrypt_token(
            "secret_" + "d" * 50
        )
        self.user.save()
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.json()["connected"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.notion_integration_token_encrypted, "")

    def test_safe_decrypt_returns_none_on_corruption(self) -> None:
        from .integrations import safe_decrypt_token

        # Garbage in DB (e.g. previous key was rotated) shouldn't crash
        # — caller should treat it as 'not connected'.
        self.assertIsNone(safe_decrypt_token("not-real-ciphertext"))
        self.assertIsNone(safe_decrypt_token(""))


class AnthropicIntegrationTests(TestCase):
    """Same contract as the Notion endpoint — token is per-user,
    encrypted at rest, never echoed back. Shape check enforces the
    `sk-ant-` prefix so an obvious typo doesn't show up as a 401
    mid-ingest."""

    def setUp(self) -> None:
        from rest_framework.test import APIClient

        self.user = User.objects.create_user(
            email="alice@anthropic.example.com",
            password="alpine-hike-2026",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/auth/me/integrations/anthropic/"

    def test_initially_disconnected(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.json()["connected"])

    def test_put_stores_encrypted(self) -> None:
        from .integrations import decrypt_token

        raw = "sk-ant-" + "a" * 50
        resp = self.client.put(self.url, {"token": raw}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["connected"])
        self.user.refresh_from_db()
        ciphertext = self.user.anthropic_api_key_encrypted
        self.assertNotIn(raw, ciphertext)
        self.assertTrue(ciphertext)
        self.assertEqual(decrypt_token(ciphertext), raw)

    def test_get_only_returns_connected_flag(self) -> None:
        from .integrations import encrypt_token

        self.user.anthropic_api_key_encrypted = encrypt_token(
            "sk-ant-" + "b" * 50
        )
        self.user.save()
        resp = self.client.get(self.url)
        self.assertEqual(set(resp.json().keys()), {"connected"})

    def test_put_rejects_wrong_prefix(self) -> None:
        resp = self.client.put(
            self.url, {"token": "bearer_xxx_not_anthropic"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_too_short(self) -> None:
        resp = self.client.put(
            self.url, {"token": "sk-ant-short"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_clears_key(self) -> None:
        from .integrations import encrypt_token

        self.user.anthropic_api_key_encrypted = encrypt_token(
            "sk-ant-" + "c" * 50
        )
        self.user.save()
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.anthropic_api_key_encrypted, "")


class NoStoreApiHeaderTests(TestCase):
    """The user-reported "saved on web but mobile shows old data"
    bug came from iOS Safari heuristically caching authenticated
    GETs. NoStoreApiMiddleware forces Cache-Control: no-store on
    every /api/* response. Verify the header is actually set."""

    def setUp(self) -> None:
        from rest_framework.test import APIClient

        self.user = User.objects.create_user(
            email="alice@nostore.example.com",
            password="alpine-hike-2026",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_api_response_has_no_store_header(self) -> None:
        resp = self.client.get("/api/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("Cache-Control", resp.headers)
        self.assertIn("no-store", resp["Cache-Control"])

    def test_non_api_response_not_touched(self) -> None:
        from django.test import RequestFactory

        from olaf.no_store_middleware import NoStoreApiMiddleware

        # Use the middleware in isolation against a non-/api/ path so
        # we don't depend on any specific Django view existing in the
        # test env — just verify the path-scoping decision.
        rf = RequestFactory()
        request = rf.get("/some-frontend-page/")

        def fake_get_response(_req):
            from django.http import HttpResponse

            return HttpResponse("ok")

        mw = NoStoreApiMiddleware(fake_get_response)
        response = mw(request)
        self.assertNotIn("no-store", response.get("Cache-Control", "").lower())
