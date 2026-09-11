"""Tests for the /u/<id> public profile endpoint (2026-09-10)."""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember

from .models import User


class PublicProfileVisibilityTests(TestCase):
    """Backend enforces `profile_show_*` toggles — pole schovaná
    uživatelem se vrátí prázdné, ostatní zůstávají. Organizer nad
    participantem obcházá gates (viz `organizer_bypass=True`).
    """

    def setUp(self) -> None:
        self.client = APIClient()
        self.target = User.objects.create_user(
            email="target@example.com",
            password="pass-abcdef-1234",
            first_name="Target",
            last_name="User",
            phone="+420111222333",
            address_street="Ulice 1",
            address_city="Praha",
            address_zip="11000",
            address_country="CZ",
            profile_show_email=False,
            profile_show_phone=False,
            profile_show_address=False,
            profile_show_avatar=True,
        )
        self.viewer = User.objects.create_user(
            email="viewer@example.com",
            password="pass-abcdef-1234",
            first_name="Viewer",
            last_name="Other",
        )
        self.url = reverse(
            "accounts:user-public-profile",
            kwargs={"user_key": str(self.target.pk)},
        )

    def test_anonymous_can_access_but_gets_no_contact_info(self) -> None:
        """2026-09-11: endpoint uvolněn na AllowAny (guides link
        z externího webu). Anonymous viewer dostane jen jméno / bio /
        avatar; e-mail/telefon/adresa vždycky prázdné bez ohledu na
        toggles — chrání proti external scrapingu."""
        # Cílový user má email + phone show=True (default), přesto
        # anonymous viewer nedostane hodnoty.
        self.target.profile_show_email = True
        self.target.profile_show_phone = True
        self.target.profile_show_address = True
        self.target.save(
            update_fields=[
                "profile_show_email",
                "profile_show_phone",
                "profile_show_address",
            ]
        )
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body["first_name"], "Target")
        # Anonymous viewer nedostává kontakt bez ohledu na toggles.
        self.assertEqual(body["email"], "")
        self.assertEqual(body["phone"], "")
        self.assertEqual(body["address_street"], "")
        self.assertFalse(body["organizer_bypass"])

    def test_hidden_fields_return_empty(self) -> None:
        self.client.force_authenticate(self.viewer)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        payload = resp.json()
        # Jméno + display_name jsou vždy viditelné, telefon/e-mail/adresa
        # jsou schovné toggly = prázdné stringy.
        self.assertEqual(payload["first_name"], "Target")
        self.assertEqual(payload["email"], "")
        self.assertEqual(payload["phone"], "")
        self.assertEqual(payload["address_street"], "")
        self.assertEqual(payload["address_city"], "")
        self.assertEqual(payload["organizer_bypass"], False)

    def test_toggled_on_fields_return_values(self) -> None:
        self.target.profile_show_email = True
        self.target.profile_show_phone = True
        self.target.save(
            update_fields=["profile_show_email", "profile_show_phone"]
        )
        self.client.force_authenticate(self.viewer)
        resp = self.client.get(self.url)
        payload = resp.json()
        self.assertEqual(payload["email"], "target@example.com")
        self.assertEqual(payload["phone"], "+420111222333")
        # Adresa zůstala schovaná.
        self.assertEqual(payload["address_street"], "")

    def test_viewing_own_profile_returns_all(self) -> None:
        """Self-view — všechny toggles se obcházejí, user vidí svá
        vlastní data i když si je schoval z veřejnosti."""
        self.client.force_authenticate(self.target)
        resp = self.client.get(self.url)
        payload = resp.json()
        self.assertEqual(payload["email"], "target@example.com")
        self.assertEqual(payload["phone"], "+420111222333")
        self.assertEqual(payload["address_street"], "Ulice 1")
        # organizer_bypass=False pro self (jsem to sám, ne pořadatel).
        self.assertEqual(payload["organizer_bypass"], False)

    def test_organizer_bypass_shows_all_for_participant(self) -> None:
        """Když viewer je owner workspacu a target má non-cancelled
        RSVP na eventu té workspace, kompletní data + badge."""
        ws = Workspace.objects.create(slug="ws-a", name="Workspace A")
        WorkspaceMember.objects.create(
            workspace=ws, user=self.viewer, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() + timedelta(days=7)
        event = Event.objects.create(
            workspace=ws,
            slug="test-event",
            title="Test event",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(event=event, user=self.target, status=RSVP.STATUS_YES)

        self.client.force_authenticate(self.viewer)
        resp = self.client.get(self.url)
        payload = resp.json()
        self.assertTrue(payload["organizer_bypass"])
        self.assertEqual(payload["email"], "target@example.com")
        self.assertEqual(payload["phone"], "+420111222333")
        self.assertEqual(payload["address_street"], "Ulice 1")

    def test_organizer_bypass_ignores_cancelled_rsvp(self) -> None:
        ws = Workspace.objects.create(slug="ws-b", name="Workspace B")
        WorkspaceMember.objects.create(
            workspace=ws, user=self.viewer, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() + timedelta(days=7)
        event = Event.objects.create(
            workspace=ws,
            slug="test-event-b",
            title="Test event B",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(
            event=event, user=self.target, status=RSVP.STATUS_CANCELLED
        )
        self.client.force_authenticate(self.viewer)
        resp = self.client.get(self.url)
        payload = resp.json()
        # Cancelled RSVP nedává bypass — respect toggles.
        self.assertFalse(payload["organizer_bypass"])
        self.assertEqual(payload["email"], "")

    def test_organizer_bypass_requires_owner_or_admin_role(self) -> None:
        """Viewer je jen MEMBER workspace-u → bypass se neaktivuje.
        Kompletní kontakt vidí jen pořadatel (owner/admin)."""
        ws = Workspace.objects.create(slug="ws-c", name="Workspace C")
        WorkspaceMember.objects.create(
            workspace=ws, user=self.viewer, role=WorkspaceMember.ROLE_MEMBER
        )
        starts = timezone.now() + timedelta(days=7)
        event = Event.objects.create(
            workspace=ws,
            slug="test-event-c",
            title="Test event C",
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(
            event=event, user=self.target, status=RSVP.STATUS_YES
        )
        self.client.force_authenticate(self.viewer)
        resp = self.client.get(self.url)
        payload = resp.json()
        self.assertFalse(payload["organizer_bypass"])
        self.assertEqual(payload["email"], "")

    def test_nonexistent_user_returns_404(self) -> None:
        self.client.force_authenticate(self.viewer)
        resp = self.client.get(
            reverse("accounts:user-public-profile", kwargs={"user_key": "99999"})
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
