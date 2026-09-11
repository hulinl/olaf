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
        # Response nese `code` pro frontend UX (2026-09-11).
        self.assertEqual(resp.json().get("code"), "created")

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

    def test_rejects_duplicate_verified_email(self) -> None:
        # Verified user už má účet → signup s tím samým e-mailem se
        # odmítá, user musí použít login / reset password.
        User.objects.create_user(
            email="marta@example.com",
            password="alpine-hike-2026",
            first_name="Marta",
            last_name="Member",
            email_verified=True,
        )
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_takes_over_unverified_email(self) -> None:
        # Unverified user (= někdo, kdo nakliknul anon RSVP) → signup
        # převezme existující row, nastaví heslo + jméno, pošle
        # verification e-mail. Žádný duplicitní account. Pozn:
        # email_verified zůstane False dokud user neproklikne odkaz.
        existing = User.objects.create_user(
            email="marta@example.com",
            password=None,  # unusable; nastavíme přes signup
            first_name="",
            last_name="",
        )
        existing.set_unusable_password()
        existing.email_verified = False
        existing.save()

        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        existing.refresh_from_db()
        # Heslo nastaveno + name updatnuté z payloadu, ale verified
        # stále False (čeká na klik).
        self.assertTrue(existing.has_usable_password())
        self.assertEqual(existing.first_name, "Marta")
        self.assertEqual(existing.last_name, "Member")
        self.assertFalse(existing.email_verified)
        # Response `code=takeover` — frontend UX ukáže „vítáme tě
        # zpátky" místo obecné hlášky (2026-09-11).
        self.assertEqual(resp.json().get("code"), "takeover")


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

    def test_verify_auto_logs_user_in(self) -> None:
        """Response nese User payload a session cookie — user je
        rovnou přihlášený, nemusí procházet login formu znovu.
        User request 2026-09-11 (aby uživatelé neodcházeli)."""
        resp = self.client.post(self.url, {"token": self.token.token}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Response má User shape s e-mailem.
        self.assertEqual(resp.json()["email"], "marta@example.com")
        # /api/auth/me/ teď 200 (session cookie set jako side effect verify).
        me = self.client.get(reverse("accounts:me"))
        self.assertEqual(me.status_code, status.HTTP_200_OK)

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
        # Frontend potřebuje rozlišit "verify email" od "wrong password"
        # aby mohl u prvního nabídnout „Poslat verifikaci znovu".
        # User report 2026-09-11: uživatel bez `code` neměl akci a
        # zůstal zablokovaný.
        self.assertEqual(resp.json().get("code"), "email_not_verified")

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


class ResendVerificationTests(TestCase):
    """User který byl blokovaný na login (email_not_verified) může přes
    tenhle endpoint znovu-vyžádat verifikační mail. Chrání proti
    enumeration — pro neexistující i verified user vrátíme stejnou 202
    odpověď bez detailu.
    """

    def setUp(self) -> None:
        self.client = APIClient()
        self.url = reverse("accounts:verify-resend")
        self.user = User.objects.create_user(
            email="pavel@example.com",
            password="hike-forest-2026",
            first_name="Pavel",
            last_name="Uchytil",
        )

    def test_sends_new_token_for_unverified_user(self) -> None:
        # Nejprve podržíme případ, kdy user má už existující (nepoužitý)
        # token — endpoint stejně pošle nový, aby vždycky měl aktuální
        # link.
        EmailVerificationToken.objects.create(user=self.user)
        mail.outbox.clear()
        resp = self.client.post(
            self.url, {"email": "pavel@example.com"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Potvrď svůj olaf účet", mail.outbox[0].subject)
        # Nový token existuje vedle starého.
        self.assertGreaterEqual(
            EmailVerificationToken.objects.filter(user=self.user).count(), 2
        )

    def test_verified_user_gets_202_but_no_email(self) -> None:
        self.user.email_verified = True
        self.user.save()
        resp = self.client.post(
            self.url, {"email": "pavel@example.com"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 0)

    def test_unknown_email_returns_202_with_no_email(self) -> None:
        # Enumeration-safe: neodhalíme, jestli e-mail v systému je.
        resp = self.client.post(
            self.url, {"email": "ghost@example.com"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 0)

    def test_missing_email_returns_400(self) -> None:
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class AnonRsvpToSignupToLoginFlowTests(TestCase):
    """Regression pro user report 2026-09-11 (uchytil.pavel@email.cz):
    uživatel prošel anon RSVP → dostal light user (unverified) → později
    signup s heslem → verify e-mail dorazil, ale user neklikl → login
    vrátí `email_not_verified` s hláškou co dělat. Endpoint /verify/
    resend/ odblokuje.
    """

    def setUp(self) -> None:
        self.client = APIClient()

    def test_full_flow_matches_prod_incident(self) -> None:
        # 1. Anon RSVP simulace — vytvoříme unusable-password user
        #    (stejně jako _create_light_user dělá).
        user = User(
            email="pavel@example.com",
            first_name="Pavel",
            last_name="Uchytil",
            email_verified=False,
        )
        user.set_unusable_password()
        user.save()

        # 2. Signup s tímtéž e-mailem — take-over flow.
        signup_url = reverse("accounts:signup")
        resp = self.client.post(
            signup_url,
            {
                "email": "pavel@example.com",
                "password": "hike-forest-2026",
                "first_name": "Pavel",
                "last_name": "Uchytil",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user.refresh_from_db()
        self.assertTrue(user.check_password("hike-forest-2026"))
        self.assertFalse(user.email_verified)  # verify e-mail v inboxu

        # 3. Login — očekáváme 403 s code=email_not_verified.
        login_url = reverse("accounts:login")
        login_resp = self.client.post(
            login_url,
            {"email": "pavel@example.com", "password": "hike-forest-2026"},
            format="json",
        )
        self.assertEqual(login_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            login_resp.json().get("code"), "email_not_verified"
        )

        # 4. User klikne „Poslat verifikaci znovu".
        mail.outbox.clear()
        resend_url = reverse("accounts:verify-resend")
        resend_resp = self.client.post(
            resend_url, {"email": "pavel@example.com"}, format="json"
        )
        self.assertEqual(resend_resp.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 1)

        # 5. Verifikuje přes vydaný token.
        token = EmailVerificationToken.objects.filter(user=user).last()
        verify_url = reverse("accounts:verify")
        verify_resp = self.client.post(
            verify_url, {"token": str(token.token)}, format="json"
        )
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)

        # 6. Login znovu — teď projde.
        login2 = self.client.post(
            login_url,
            {"email": "pavel@example.com", "password": "hike-forest-2026"},
            format="json",
        )
        self.assertEqual(login2.status_code, status.HTTP_200_OK)


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


class ProfileSaveRoundTripTests(TestCase):
    """Locks in the contract that EVERY profile field the frontend
    knows about can be PATCH'd through /api/auth/me/ and round-trips
    on the next GET.

    Born from a real bug 2026-05-21 where the form payload silently
    omitted half the fields (address + billing missing). Local state
    showed the changes; refresh showed empty. The class of bug —
    "we forgot to add a field" — is easy to re-introduce. Hitting
    every field at once catches the serializer, the model, and the
    GET response in a single check.

    Also locks in that choice fields (diet, fitness_level) accept
    empty string, since the dropdowns show "Nevyplněno" as a valid
    selection.
    """

    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="roundtrip@example.com",
            password="alpine-hike-2026",
            email_verified=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("accounts:me")

    def _full_payload(self) -> dict:
        return {
            "first_name": "Adventurer",
            "last_name": "Olafsson",
            "display_name": "Olaf the Bold",
            "phone": "+420 777 123 456",
            "address_street": "Beskydská 7",
            "address_city": "Frýdek-Místek",
            "address_zip": "73801",
            "address_country": "CZ",
            "has_billing_address": True,
            "billing_name": "Olaf Adventures s.r.o.",
            "billing_ico": "12345678",
            "billing_dic": "CZ12345678",
            "billing_street": "Nádražní 1",
            "billing_city": "Ostrava",
            "billing_zip": "70200",
            "billing_country": "CZ",
            "fitness_level": "advanced",
            "fitness_note": "10+ years",
            "pace_10k": "0:45:00",
            "weekly_km": 60,
            "longest_run": "80 km",
            "diet": "vegetarian",
            "diet_note": "no nuts",
            "tshirt_size": "L",
            "emergency_contact_name": "Marta",
            "emergency_contact_phone": "+420 777 999 888",
            "emergency_contact_relationship": "Spouse",
        }

    def test_every_field_persists_and_round_trips(self) -> None:
        payload = self._full_payload()
        patch_resp = self.client.patch(self.url, payload, format="json")
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        for key, value in payload.items():
            self.assertEqual(
                getattr(self.user, key),
                value,
                msg=f"Field {key!r} did not persist to the DB",
            )
        get_resp = self.client.get(self.url)
        body = get_resp.json()
        for key, value in payload.items():
            self.assertEqual(
                body[key],
                value,
                msg=f"Field {key!r} did not come back on GET",
            )

    def test_empty_diet_accepted(self) -> None:
        resp = self.client.patch(self.url, {"diet": ""}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.diet, "")

    def test_empty_fitness_level_accepted(self) -> None:
        resp = self.client.patch(
            self.url, {"fitness_level": ""}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.fitness_level, "")

    def test_notification_prefs_round_trip(self) -> None:
        """Locks in that every notification toggle the frontend
        renders can be written and read back. Set was extended
        2026-05-21 with mention / event_update / rsvp_status; this
        test would catch a serializer drift that drops one of them."""
        payload = {
            "notify_on_discussion_reply": False,
            "notify_on_discussion_announce": False,
            "notify_on_discussion_mention": False,
            "notify_on_event_update": False,
            "notify_on_rsvp_status": False,
        }
        resp = self.client.patch(self.url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        for key, value in payload.items():
            self.assertEqual(getattr(self.user, key), value)
        get_resp = self.client.get(self.url).json()
        for key in payload:
            self.assertIn(key, get_resp)
            self.assertFalse(get_resp[key])

    def test_country_codes_round_trip(self) -> None:
        for code in ["CZ", "SK", "AT", "DE", "GB", ""]:
            with self.subTest(code=code):
                resp = self.client.patch(
                    self.url,
                    {"address_country": code, "billing_country": code},
                    format="json",
                )
                self.assertEqual(resp.status_code, status.HTTP_200_OK)
                self.user.refresh_from_db()
                self.assertEqual(self.user.address_country, code)
                self.assertEqual(self.user.billing_country, code)


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
