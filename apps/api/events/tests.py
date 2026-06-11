from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


def _build_event(workspace, **overrides) -> Event:
    defaults = {
        "workspace": workspace,
        "slug": "letni-kemp-2026",
        "title": "Letní kemp 2026",
        "description": "Intenzivní víkend v Beskydech.",
        "starts_at": timezone.now() + timedelta(days=30),
        "ends_at": timezone.now() + timedelta(days=33),
        "tz": "Europe/Prague",
        "location_text": "Beskydy",
        "capacity": 2,
        "waitlist_enabled": True,
        "status": Event.STATUS_PUBLISHED,
        "visibility": Event.VISIBILITY_PUBLIC,
    }
    defaults.update(overrides)
    return Event.objects.create(**defaults)


def _valid_answers() -> dict:
    return {
        "tshirt_size": "M",
        "diet": "omnivore",
        "fitness_level": "intermediate",
        "fitness_note": "Run ~30 km / week.",
        "health_notes": "",
        "emergency_contact_name": "Eve Contact",
        "emergency_contact_phone": "+420 123 456 789",
        "photo_consent": True,
    }


class EventModelTests(TestCase):
    def setUp(self) -> None:
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)

    def test_slug_unique_within_workspace(self) -> None:
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            Event.objects.create(
                workspace=self.ws,
                slug="letni-kemp-2026",
                title="dup",
                starts_at=timezone.now(),
                ends_at=timezone.now() + timedelta(hours=1),
            )

    def test_ends_at_before_starts_at_rejected(self) -> None:
        from django.core.exceptions import ValidationError

        bad = Event(
            workspace=self.ws,
            slug="bad-event",
            title="Bad",
            starts_at=timezone.now() + timedelta(days=2),
            ends_at=timezone.now() + timedelta(days=1),
        )
        with self.assertRaises(ValidationError):
            bad.full_clean()

    def test_at_capacity_logic(self) -> None:
        u1 = User.objects.create_user(
            email="u1@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="One",
        )
        u2 = User.objects.create_user(
            email="u2@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="Two",
        )
        u3 = User.objects.create_user(
            email="u3@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="Three",
        )
        RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        self.assertTrue(self.event.is_at_capacity)
        third = RSVP.create_for_event(event=self.event, user=u3, questionnaire_answers={})
        self.assertEqual(third.status, RSVP.STATUS_WAITLIST)
        self.assertEqual(third.waitlist_position, 1)

    def test_waitlist_promotion_on_cancel(self) -> None:
        u1 = User.objects.create_user(email="u1@example.com", password="pass-abcdef-1234", first_name="A", last_name="One")
        u2 = User.objects.create_user(email="u2@example.com", password="pass-abcdef-1234", first_name="A", last_name="Two")
        u3 = User.objects.create_user(email="u3@example.com", password="pass-abcdef-1234", first_name="A", last_name="Three")
        r1 = RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        r3 = RSVP.create_for_event(event=self.event, user=u3, questionnaire_answers={})
        self.assertEqual(r3.status, RSVP.STATUS_WAITLIST)
        r1.cancel()
        r3.refresh_from_db()
        self.assertEqual(r3.status, RSVP.STATUS_YES)
        self.assertIsNone(r3.waitlist_position)

    def test_requires_approval_routes_to_pending(self) -> None:
        self.event.requires_approval = True
        self.event.save()
        u = User.objects.create_user(email="u@example.com", password="pass-abcdef-1234", first_name="A", last_name="X")
        r = RSVP.create_for_event(event=self.event, user=u, questionnaire_answers={})
        self.assertEqual(r.status, RSVP.STATUS_PENDING_APPROVAL)


class PublicEventEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.url = reverse(
            "events:public",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )

    def test_published_event_visible_to_anyone(self) -> None:
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body["slug"], "letni-kemp-2026")
        self.assertEqual(body["workspace_slug"], "olafadventures")
        self.assertEqual(body["title"], "Letní kemp 2026")
        self.assertTrue(body["is_open_for_rsvp"])

    def test_draft_event_returns_friendly_preview_to_anonymous(self) -> None:
        # Draft events used to 404 for non-owners; we now serve a slim
        # "is_draft_preview" payload (200) so the public landing can
        # show a friendly placeholder.
        self.event.status = Event.STATUS_DRAFT
        self.event.save()
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["is_draft_preview"])
        self.assertNotIn("blocks", resp.json())

    def test_draft_event_visible_to_owner(self) -> None:
        self.event.status = Event.STATUS_DRAFT
        self.event.save()
        owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.client.force_authenticate(owner)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class RSVPEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.url = reverse(
            "events:rsvp",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )

    def test_anonymous_rsvp_creates_unverified_guest_user(self) -> None:
        # Anon RSVP zakládá guest usera (`email_verified=False`,
        # unusable password) — žádný auto-login, žádný plnohodnotný
        # účet. Verifikace + heslo se nastaví až přes signup flow s
        # tím samým e-mailem.
        resp = self.client.post(
            self.url,
            {
                "answers": _valid_answers(),
                "account": {
                    "email": "marta@example.com",
                    "first_name": "Marta",
                    "last_name": "Runner",
                    "phone": "+420 111",
                },
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        body = resp.json()
        self.assertEqual(body["status"], RSVP.STATUS_YES)
        user = User.objects.get(email="marta@example.com")
        self.assertFalse(user.email_verified)
        self.assertFalse(user.has_usable_password())
        # A confirmation e-mail dorazí; ale uživatel není přihlášený.
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Letní kemp", mail.outbox[0].subject)

    def test_anonymous_rsvp_does_not_create_session(self) -> None:
        # Předtím se po anon RSVP volalo `login(request, user)` — user
        # skončil v aplikaci přihlášený, což zaskočilo všechny, kteří
        # si chtěli jen RSVPnout a aplikaci nepoužívat. Test brání
        # regresi: po RSVP musí být klient pořád anonymní.
        self.client.post(
            self.url,
            {
                "answers": _valid_answers(),
                "account": {
                    "email": "marta@example.com",
                    "first_name": "Marta",
                    "last_name": "Runner",
                },
            },
            format="json",
        )
        # /api/auth/me/ by měl 401 — žádná session.
        me = self.client.get("/api/auth/me/")
        self.assertIn(me.status_code, (401, 403))

    def test_anonymous_rsvp_under_verified_email_returns_409(self) -> None:
        # Bezpečnostní test: cizí uživatel nesmí přes anon RSVP přepsat
        # nebo se "vetnout" do session vlastníka e-mailu, který má v
        # systému plnohodnotný (verified) účet. Předtím auto-login
        # tohle umožňoval.
        User.objects.create_user(
            email="real@example.com",
            password="pass-abcdef-1234",
            first_name="Real",
            last_name="User",
            email_verified=True,
        )
        resp = self.client.post(
            self.url,
            {
                "answers": _valid_answers(),
                "account": {
                    "email": "real@example.com",
                    "first_name": "Imposter",
                    "last_name": "User",
                },
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.json().get("code"), "email_has_account")
        # Real user se nezměnil.
        real = User.objects.get(email="real@example.com")
        self.assertEqual(real.first_name, "Real")

    def test_anonymous_rsvp_missing_account_rejected(self) -> None:
        resp = self.client.post(
            self.url, {"answers": _valid_answers()}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_authenticated_rsvp(self) -> None:
        user = User.objects.create_user(
            email="petr@example.com", password="pass-abcdef-1234",
            first_name="Petr", last_name="Runner", email_verified=True,
        )
        self.client.force_authenticate(user)
        resp = self.client.post(self.url, {"answers": _valid_answers()}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        rsvp = RSVP.objects.get(user=user, event=self.event)
        self.assertEqual(rsvp.status, RSVP.STATUS_YES)

    def test_rsvp_validates_questionnaire(self) -> None:
        user = User.objects.create_user(
            email="petr@example.com", password="pass-abcdef-1234",
            first_name="Petr", last_name="Runner", email_verified=True,
        )
        # `diet` sekce musí být enabled, aby validator vyžadoval její
        # validity. Po opravě `[] = nic` nesmí test spoléhat na default.
        self.event.enabled_questionnaire_sections = ["diet"]
        self.event.save()
        self.client.force_authenticate(user)
        bad = _valid_answers()
        bad["diet"] = "other"
        bad["diet_note"] = ""  # other without note
        resp = self.client.post(self.url, {"answers": bad}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rsvp_closed_event_400(self) -> None:
        self.event.status = Event.STATUS_CLOSED
        self.event.save()
        user = User.objects.create_user(
            email="petr@example.com", password="pass-abcdef-1234",
            first_name="Petr", last_name="Runner", email_verified=True,
        )
        self.client.force_authenticate(user)
        resp = self.client.post(self.url, {"answers": _valid_answers()}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_rsvp_promotes_waitlist(self) -> None:
        u1 = User.objects.create_user(email="u1@example.com", password="pass-abcdef-1234", first_name="A", last_name="One", email_verified=True)
        u2 = User.objects.create_user(email="u2@example.com", password="pass-abcdef-1234", first_name="A", last_name="Two", email_verified=True)
        u3 = User.objects.create_user(email="u3@example.com", password="pass-abcdef-1234", first_name="A", last_name="Three", email_verified=True)
        RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        r3 = RSVP.create_for_event(event=self.event, user=u3, questionnaire_answers={})
        self.assertEqual(r3.status, RSVP.STATUS_WAITLIST)

        cancel_url = reverse(
            "events:rsvp-cancel",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        self.client.force_authenticate(u1)
        resp = self.client.post(cancel_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        r3.refresh_from_db()
        self.assertEqual(r3.status, RSVP.STATUS_YES)


class OwnerEventListTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )

    def test_owner_sees_their_event(self) -> None:
        self.client.force_authenticate(self.owner)
        resp = self.client.get(reverse("events:owner"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        slugs = [e["slug"] for e in resp.json()]
        self.assertIn("letni-kemp-2026", slugs)

    def test_owner_can_view_event_rsvps(self) -> None:
        participant = User.objects.create_user(
            email="p@example.com", password="pass-abcdef-1234",
            first_name="P", last_name="One", email_verified=True,
        )
        RSVP.create_for_event(
            event=self.event, user=participant, questionnaire_answers=_valid_answers()
        )
        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:rsvps",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["user_email"], "p@example.com")

    def test_non_owner_blocked_from_rsvp_list(self) -> None:
        outsider = User.objects.create_user(
            email="x@example.com", password="pass-abcdef-1234",
            first_name="X", last_name="Y", email_verified=True,
        )
        self.client.force_authenticate(outsider)
        url = reverse(
            "events:rsvps",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_gets_401_on_rsvp_list(self) -> None:
        # Important: anonymous must get 401 (not 403) so the frontend can
        # distinguish "log in" from "not your event" and route to /login.
        url = reverse(
            "events:rsvps",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anonymous_gets_401_on_owner_events(self) -> None:
        resp = self.client.get(reverse("events:owner"))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rsvp_list_404_for_missing_event(self) -> None:
        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:rsvps",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "does-not-exist"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_events_excludes_other_workspaces(self) -> None:
        # Owner of olafadventures must not see events from a workspace they don't own.
        other_ws = Workspace.objects.create(slug="other-ws", name="Other")
        _build_event(other_ws, slug="other-event", title="Other Event")
        self.client.force_authenticate(self.owner)
        resp = self.client.get(reverse("events:owner"))
        slugs = [e["slug"] for e in resp.json()]
        self.assertIn("letni-kemp-2026", slugs)
        self.assertNotIn("other-event", slugs)


class CreateUpdateEventTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.outsider = User.objects.create_user(
            email="out@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Ut", email_verified=True,
        )

    def _create_payload(self) -> dict:
        return {
            "slug": "podzimni-kemp-2026",
            "title": "Podzimní kemp 2026",
            "description": "Beskydy, multi-day camp.",
            "starts_at": (timezone.now() + timedelta(days=60)).isoformat(),
            "ends_at": (timezone.now() + timedelta(days=63)).isoformat(),
            "tz": "Europe/Prague",
            "location_text": "Beskydy",
            "capacity": 10,
            "waitlist_enabled": True,
            "visibility": Event.VISIBILITY_PUBLIC,
            "status": Event.STATUS_PUBLISHED,
        }

    def test_owner_can_create_event(self) -> None:
        self.client.force_authenticate(self.owner)
        url = reverse("events:create", kwargs={"workspace_slug": "olafadventures"})
        resp = self.client.post(url, self._create_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.json()["slug"], "podzimni-kemp-2026")
        self.assertEqual(resp.json()["workspace_slug"], "olafadventures")

    def test_non_owner_blocked_from_create(self) -> None:
        self.client.force_authenticate(self.outsider)
        url = reverse("events:create", kwargs={"workspace_slug": "olafadventures"})
        resp = self.client.post(url, self._create_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_blocked_from_create(self) -> None:
        url = reverse("events:create", kwargs={"workspace_slug": "olafadventures"})
        resp = self.client.post(url, self._create_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_duplicate_slug_rejected(self) -> None:
        _build_event(self.ws, slug="podzimni-kemp-2026", title="exists")
        self.client.force_authenticate(self.owner)
        url = reverse("events:create", kwargs={"workspace_slug": "olafadventures"})
        resp = self.client.post(url, self._create_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slug", resp.json())

    def test_create_rejects_inverted_dates(self) -> None:
        self.client.force_authenticate(self.owner)
        payload = self._create_payload()
        payload["ends_at"] = (timezone.now() + timedelta(days=10)).isoformat()
        payload["starts_at"] = (timezone.now() + timedelta(days=20)).isoformat()
        url = reverse("events:create", kwargs={"workspace_slug": "olafadventures"})
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_update_event(self) -> None:
        event = _build_event(self.ws, slug="upravit-me-2026", title="Old title")
        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:update",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "upravit-me-2026",
            },
        )
        resp = self.client.patch(
            url, {"title": "New title", "capacity": 20}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        event.refresh_from_db()
        self.assertEqual(event.title, "New title")
        self.assertEqual(event.capacity, 20)

    def test_non_owner_blocked_from_update(self) -> None:
        _build_event(self.ws, slug="upravit-me-2026", title="Old title")
        self.client.force_authenticate(self.outsider)
        url = reverse(
            "events:update",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "upravit-me-2026",
            },
        )
        resp = self.client.patch(url, {"title": "Hack"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_location_url_syncs_to_existing_map_block(self) -> None:
        # User chce jeden zdroj pravdy pro URL mapy. Když uloží
        # Detaily form s `location_url`, backend rozsynchronizuje
        # existující Map block tak, aby `map_url` v něm sedl.
        event = _build_event(self.ws, slug="sync-detaily-2026")
        event.blocks = [
            {
                "id": "m1",
                "type": "map",
                "payload": {
                    "title": "Trasa",
                    "eyebrow": "Mapa",
                    "caption": "",
                    "map_url": "https://mapy.com/old",
                },
            }
        ]
        event.save(update_fields=["blocks"])

        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:update",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "sync-detaily-2026",
            },
        )
        new_url = "https://maps.app.goo.gl/abc123"
        resp = self.client.patch(
            url, {"location_url": new_url}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        event.refresh_from_db()
        self.assertEqual(event.location_url, new_url)
        self.assertEqual(event.blocks[0]["payload"]["map_url"], new_url)

    def test_map_block_url_syncs_back_to_location_url(self) -> None:
        # Druhý směr: user uloží Obsah s novým `map_url`, backend
        # propíše do `event.location_url`, aby Detaily form ukazoval
        # stejné. Bez tohohle uživatel viděl divergovaná pole.
        event = _build_event(self.ws, slug="sync-obsah-2026")
        event.location_url = "https://mapy.com/old"
        event.save(update_fields=["location_url"])

        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:update",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "sync-obsah-2026",
            },
        )
        new_url = "https://maps.app.goo.gl/xyz789"
        resp = self.client.patch(
            url,
            {
                "blocks": [
                    {
                        "id": "m2",
                        "type": "map",
                        "payload": {
                            "title": "Trasa",
                            "eyebrow": "Mapa",
                            "caption": "",
                            "map_url": new_url,
                        },
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        event.refresh_from_db()
        self.assertEqual(event.location_url, new_url)
        self.assertEqual(event.blocks[0]["payload"]["map_url"], new_url)


class RsvpCancelByTokenTests(TestCase):
    """Magic-link cancel — anon guest RSVP musí jít zrušit z e-mailu
    bez session. Token na RSVP nese plnou autoritu cancel-u."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(
            slug="olafadventures", name="Olaf Adventures"
        )
        self.event = _build_event(self.ws)
        self.user = User.objects.create_user(
            email="guest@example.com",
            password="alpine-hike-2026",
            first_name="Guest",
            last_name="User",
            email_verified=True,
        )
        self.rsvp = RSVP.create_for_event(
            event=self.event, user=self.user, questionnaire_answers={}
        )
        self.url = reverse("events:rsvp-cancel-by-token")

    def test_get_returns_rsvp_info(self) -> None:
        # GET — žádný cancel side-effect; jen vrátí, aby frontend mohl
        # vykreslit potvrzovací prompt.
        resp = self.client.get(f"{self.url}?token={self.rsvp.cancel_token}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        body = resp.json()
        self.assertEqual(body["event_title"], self.event.title)
        self.assertEqual(body["status"], RSVP.STATUS_YES)
        self.rsvp.refresh_from_db()
        self.assertEqual(self.rsvp.status, RSVP.STATUS_YES)

    def test_post_cancels_rsvp(self) -> None:
        resp = self.client.post(
            self.url,
            {"token": str(self.rsvp.cancel_token)},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.json()["status"], RSVP.STATUS_CANCELLED)
        self.rsvp.refresh_from_db()
        self.assertEqual(self.rsvp.status, RSVP.STATUS_CANCELLED)

    def test_post_sends_cancellation_email(self) -> None:
        # Closing-the-loop e-mail po zrušení — user dostal confirmation,
        # teď ho informujeme, že je registrace pryč.
        from django.core import mail as djmail

        djmail.outbox = []
        self.client.post(
            self.url,
            {"token": str(self.rsvp.cancel_token)},
            format="json",
        )
        # Některé maily mohou zařadit waitlist promote – chytíme jen
        # ten náš subjekt.
        cancel_mails = [m for m in djmail.outbox if "Registrace zrušena" in m.subject]
        self.assertTrue(cancel_mails, f"Cancellation email not sent: {djmail.outbox}")
        self.assertIn(self.event.title, cancel_mails[0].subject)
        # Cancellation mail by NEMĚL flagovat owner-driven, když si user
        # zrušil registraci sám.
        self.assertNotIn("Zrušení udělal pořadatel", cancel_mails[0].body)

    def test_idempotent_on_already_cancelled(self) -> None:
        self.rsvp.cancel()
        resp = self.client.post(
            self.url,
            {"token": str(self.rsvp.cancel_token)},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["status"], RSVP.STATUS_CANCELLED)

    def test_missing_token_400(self) -> None:
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_token_404(self) -> None:
        resp = self.client.post(
            self.url,
            {"token": "00000000-0000-0000-0000-000000000000"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_malformed_token_404(self) -> None:
        # ValueError pro non-UUID string padá do stejné 404 jako neznámý
        # token — chceme aby endpoint nedával otisk "existující token vs.
        # malformed", což by usnadnilo bruteforce-y.
        resp = self.client.post(
            self.url,
            {"token": "not-a-uuid"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class CancelEventTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="Olaf Adventures")
        self.event = _build_event(self.ws)
        self.owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        # Two RSVPs to fan-out to
        u1 = User.objects.create_user(
            email="p1@example.com", password="pass-abcdef-1234",
            first_name="P", last_name="One", email_verified=True,
        )
        u2 = User.objects.create_user(
            email="p2@example.com", password="pass-abcdef-1234",
            first_name="P", last_name="Two", email_verified=True,
        )
        RSVP.create_for_event(event=self.event, user=u1, questionnaire_answers={})
        RSVP.create_for_event(event=self.event, user=u2, questionnaire_answers={})
        # One declined RSVP that should NOT receive the cancellation email
        u3 = User.objects.create_user(
            email="p3@example.com", password="pass-abcdef-1234",
            first_name="P", last_name="Three", email_verified=True,
        )
        RSVP.objects.create(
            event=self.event, user=u3, status=RSVP.STATUS_NO,
            questionnaire_answers={},
        )
        self.url = reverse(
            "events:cancel",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )

    def test_owner_can_cancel_with_reason(self) -> None:
        mail.outbox.clear()
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            self.url, {"reason": "Storm coming in."}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, Event.STATUS_CANCELLED)
        self.assertEqual(self.event.cancellation_reason, "Storm coming in.")
        # 2 active RSVPs got emailed, the 'no' RSVP did not
        self.assertEqual(len(mail.outbox), 2)
        recipients = {m.to[0] for m in mail.outbox}
        self.assertEqual(recipients, {"p1@example.com", "p2@example.com"})
        for m in mail.outbox:
            self.assertIn("zrušena", m.subject)
            self.assertIn("Storm coming in", m.body)

    def test_cancel_without_reason_still_works(self) -> None:
        mail.outbox.clear()
        self.client.force_authenticate(self.owner)
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 2)

    def test_non_owner_blocked_from_cancel(self) -> None:
        outsider = User.objects.create_user(
            email="x@example.com", password="pass-abcdef-1234",
            first_name="X", last_name="Y", email_verified=True,
        )
        self.client.force_authenticate(outsider)
        resp = self.client.post(self.url, {"reason": "no"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_double_cancel_idempotent(self) -> None:
        self.client.force_authenticate(self.owner)
        self.client.post(self.url, {"reason": "first"}, format="json")
        mail.outbox.clear()
        resp = self.client.post(self.url, {"reason": "second"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.event.refresh_from_db()
        # Reason from first cancel sticks; no second fan-out.
        self.assertEqual(self.event.cancellation_reason, "first")
        self.assertEqual(len(mail.outbox), 0)


class ConfigurableQuestionnaireTests(TestCase):
    """Owner picks which sections appear on RSVP; serializer validates only those."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olafadventures", name="OA")
        self.event = _build_event(self.ws)

    def _rsvp_url(self) -> str:
        return reverse(
            "events:rsvp",
            kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
        )

    def test_empty_sections_let_rsvp_through_with_no_answers(self) -> None:
        # `enabled_questionnaire_sections=[]` znamená "owner si vypnul
        # všechny extra sekce, žádná pole na dotazníku". Backend musí
        # přijmout RSVP bez vyplněných polí. Předtím tu byl
        # `enabled or full_list` — falsy [] padlo na plný seznam, user
        # po anon RSVP dostal "answers.tshirt_size: required" i když
        # frontend (správně) nic neposílal.
        self.event.enabled_questionnaire_sections = []
        self.event.save()
        resp = self.client.post(
            self._rsvp_url(),
            {
                "answers": {},
                "account": {
                    "email": "p@example.com",
                    "first_name": "P", "last_name": "One",
                },
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

    def test_minimal_sections_let_rsvp_through(self) -> None:
        # Only photo_consent required.
        self.event.enabled_questionnaire_sections = ["photo_consent"]
        self.event.save()
        resp = self.client.post(
            self._rsvp_url(),
            {
                "answers": {"photo_consent": True},
                "account": {
                    "email": "p@example.com",
                    "first_name": "P", "last_name": "One",
                },
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        # Disabled fields not stored.
        rsvp = RSVP.objects.get(user__email="p@example.com")
        self.assertEqual(rsvp.questionnaire_answers, {"photo_consent": True})

    def test_disabled_fields_in_payload_silently_dropped(self) -> None:
        self.event.enabled_questionnaire_sections = ["tshirt_size", "photo_consent"]
        self.event.save()
        resp = self.client.post(
            self._rsvp_url(),
            {
                "answers": {
                    "tshirt_size": "L",
                    "photo_consent": True,
                    # These shouldn't be persisted:
                    "diet": "vegan",
                    "health_notes": "secret",
                },
                "account": {
                    "email": "p@example.com",
                    "first_name": "P", "last_name": "One",
                },
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        rsvp = RSVP.objects.get(user__email="p@example.com")
        self.assertEqual(
            rsvp.questionnaire_answers,
            {"tshirt_size": "L", "photo_consent": True},
        )

    def _make_owner_and_applicant(self):
        owner = User.objects.create_user(
            email="owner@example.com", password="pass-abcdef-1234",
            first_name="O", last_name="Wner", email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=owner, role=WorkspaceMember.ROLE_OWNER
        )
        applicant = User.objects.create_user(
            email="a@example.com", password="pass-abcdef-1234",
            first_name="A", last_name="One", email_verified=True,
        )
        return owner, applicant

    def test_owner_can_approve_pending_rsvp(self) -> None:
        self.event.requires_approval = True
        self.event.save()
        owner, applicant = self._make_owner_and_applicant()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        self.assertEqual(rsvp.status, RSVP.STATUS_PENDING_APPROVAL)
        self.client.force_authenticate(owner)
        url = reverse(
            "events:rsvp-approve",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rsvp.refresh_from_db()
        self.assertEqual(rsvp.status, RSVP.STATUS_YES)

    def test_owner_can_reject_pending_rsvp(self) -> None:
        self.event.requires_approval = True
        self.event.save()
        owner, applicant = self._make_owner_and_applicant()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        self.client.force_authenticate(owner)
        url = reverse(
            "events:rsvp-reject",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rsvp.refresh_from_db()
        self.assertEqual(rsvp.status, RSVP.STATUS_CANCELLED)

    def test_approve_not_pending_returns_400(self) -> None:
        owner, applicant = self._make_owner_and_applicant()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        self.assertEqual(rsvp.status, RSVP.STATUS_YES)
        self.client.force_authenticate(owner)
        url = reverse(
            "events:rsvp-approve",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_owner_blocked_from_approve(self) -> None:
        outsider = User.objects.create_user(
            email="x@example.com", password="pass-abcdef-1234",
            first_name="X", last_name="Y", email_verified=True,
        )
        _, applicant = self._make_owner_and_applicant()
        self.event.requires_approval = True
        self.event.save()
        # Re-fetch RSVP via the applicant who needs pending status.
        RSVP.objects.filter(event=self.event, user=applicant).delete()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        self.client.force_authenticate(outsider)
        url = reverse(
            "events:rsvp-approve",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_remove_confirmed_rsvp(self) -> None:
        # Použití pro duplicate cleanup — owner odebere potvrzeného
        # účastníka (`reject_rsvp` umí jen pending, tady jde o yes/
        # waitlist). RSVP přechází na cancelled, NOT delete.
        owner, applicant = self._make_owner_and_applicant()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        self.assertEqual(rsvp.status, RSVP.STATUS_YES)
        self.client.force_authenticate(owner)
        url = reverse(
            "events:rsvp-remove",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rsvp.refresh_from_db()
        self.assertEqual(rsvp.status, RSVP.STATUS_CANCELLED)

    def test_remove_is_idempotent(self) -> None:
        owner, applicant = self._make_owner_and_applicant()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        rsvp.cancel()
        self.client.force_authenticate(owner)
        url = reverse(
            "events:rsvp-remove",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_non_owner_blocked_from_remove(self) -> None:
        outsider = User.objects.create_user(
            email="rm@example.com", password="pass-abcdef-1234",
            first_name="X", last_name="Y", email_verified=True,
        )
        _, applicant = self._make_owner_and_applicant()
        rsvp = RSVP.create_for_event(
            event=self.event, user=applicant, questionnaire_answers={}
        )
        self.client.force_authenticate(outsider)
        url = reverse(
            "events:rsvp-remove",
            kwargs={
                "workspace_slug": "olafadventures",
                "event_slug": "letni-kemp-2026",
                "rsvp_id": rsvp.pk,
            },
        )
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_blocks_default_to_empty(self) -> None:
        self.assertEqual(self.event.blocks, [])

    def test_event_payload_exposes_blocks(self) -> None:
        from events.blocks import validate_blocks

        good = [
            {
                "id": "abc",
                "type": "hero",
                "payload": {
                    "cover_url": "https://example.com/foo.jpg",
                    "eyebrow": "Rakousko · Tyrolské Alpy",
                    "subtitle": "Čtyři dny v Alpách.",
                    "meta": [
                        {"k": "Délka", "v": "4 dny"},
                        {"k": "Náročnost", "v": "3 / 5"},
                    ],
                },
            },
            {
                "id": "def",
                "type": "stats",
                "payload": {
                    "tiles": [
                        {"label": "denní trek", "value": "4"},
                        {"label": "horské chaty", "value": "3"},
                    ],
                },
            },
        ]
        validate_blocks(good)
        self.event.blocks = good
        self.event.save()
        resp = self.client.get(
            reverse(
                "events:public",
                kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(len(body["blocks"]), 2)
        self.assertEqual(body["blocks"][0]["type"], "hero")

    def test_block_validator_rejects_unknown_type(self) -> None:
        from events.blocks import BlockValidationError, validate_blocks

        with self.assertRaises(BlockValidationError):
            validate_blocks(
                [{"id": "x", "type": "bogus", "payload": {}}]
            )

    def test_block_validator_rejects_duplicate_id(self) -> None:
        from events.blocks import BlockValidationError, validate_blocks

        with self.assertRaises(BlockValidationError):
            validate_blocks(
                [
                    {"id": "same", "type": "prose", "payload": {"heading": "x", "body": "y"}},
                    {"id": "same", "type": "prose", "payload": {"heading": "a", "body": "b"}},
                ]
            )

    def test_block_validator_requires_stats_tiles(self) -> None:
        from events.blocks import BlockValidationError, validate_blocks

        with self.assertRaises(BlockValidationError):
            validate_blocks(
                [{"id": "x", "type": "stats", "payload": {"tiles": []}}]
            )

    def test_event_payload_exposes_effective_sections(self) -> None:
        self.event.enabled_questionnaire_sections = ["tshirt_size", "diet"]
        self.event.save()
        resp = self.client.get(
            reverse(
                "events:public",
                kwargs={"workspace_slug": "olafadventures", "event_slug": "letni-kemp-2026"},
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resp.json()["enabled_questionnaire_sections"],
            ["tshirt_size", "diet"],
        )


class CompleteFinishedEventsTaskTests(TestCase):
    def setUp(self) -> None:
        self.workspace = Workspace.objects.create(
            slug="olaf-adventures", name="Olaf Adventures"
        )

    def test_flips_published_event_whose_end_has_passed(self) -> None:
        from .tasks import complete_finished_events_task

        ended = _build_event(
            self.workspace,
            slug="past-camp",
            starts_at=timezone.now() - timedelta(days=5),
            ends_at=timezone.now() - timedelta(days=2),
        )
        upcoming = _build_event(
            self.workspace,
            slug="future-camp",
            starts_at=timezone.now() + timedelta(days=10),
            ends_at=timezone.now() + timedelta(days=12),
        )

        result = complete_finished_events_task()

        ended.refresh_from_db()
        upcoming.refresh_from_db()
        self.assertEqual(result["flipped"], 1)
        self.assertEqual(ended.status, Event.STATUS_COMPLETED)
        self.assertEqual(upcoming.status, Event.STATUS_PUBLISHED)

    def test_leaves_draft_and_cancelled_alone(self) -> None:
        from .tasks import complete_finished_events_task

        draft = _build_event(
            self.workspace,
            slug="draft-past",
            status=Event.STATUS_DRAFT,
            starts_at=timezone.now() - timedelta(days=5),
            ends_at=timezone.now() - timedelta(days=2),
        )
        cancelled = _build_event(
            self.workspace,
            slug="cancelled-past",
            status=Event.STATUS_CANCELLED,
            starts_at=timezone.now() - timedelta(days=5),
            ends_at=timezone.now() - timedelta(days=2),
        )

        complete_finished_events_task()

        draft.refresh_from_db()
        cancelled.refresh_from_db()
        self.assertEqual(draft.status, Event.STATUS_DRAFT)
        self.assertEqual(cancelled.status, Event.STATUS_CANCELLED)
