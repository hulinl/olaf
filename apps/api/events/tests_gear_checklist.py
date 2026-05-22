"""RSVP gear checklist endpoint coverage.

`POST /events/<ws>/<ev>/gear-checklist/` toggluje item_id on/off pro
přihlášku aktuálního uživatele. Klíčový pro packing UX během
přípravy na akci — když se to rozbije, účastníci nevidí pokrok
v balení a buď přijdou bez gear nebo si stěžují.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from gear.models import GearItem, GearList, GearListItem
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


class RsvpGearChecklistTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@gc.com")
        self.participant = _make_user("p@gc.com")
        self.ws = _make_workspace(self.owner, slug="gcws")
        # Gear list with three items.
        gear_list = GearList.objects.create(user=self.owner, name="Outdoor")
        self.item_a = GearItem.objects.create(user=self.owner, name="Spacák")
        self.item_b = GearItem.objects.create(user=self.owner, name="Karimatka")
        self.item_c = GearItem.objects.create(user=self.owner, name="Lampa")
        for it in (self.item_a, self.item_b, self.item_c):
            GearListItem.objects.create(gear_list=gear_list, item=it)

        starts = timezone.now() + timedelta(days=14)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="ev",
            title="E",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
            recommended_gear_list=gear_list,
        )
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.participant)
        self.url = reverse(
            "events:rsvp-gear-checklist",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_check_item_stores_timestamp(self) -> None:
        r = self.client.patch(
            self.url,
            {"item_id": self.item_a.pk, "is_checked": True},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        state = r.json()["gear_checklist"]
        self.assertIn(str(self.item_a.pk), state)
        # Timestamp ISO format.
        self.assertTrue(state[str(self.item_a.pk)].startswith("20"))

    def test_uncheck_removes_item_key(self) -> None:
        # Check first.
        self.client.patch(
            self.url,
            {"item_id": self.item_a.pk, "is_checked": True},
            format="json",
        )
        # Uncheck.
        r = self.client.patch(
            self.url,
            {"item_id": self.item_a.pk, "is_checked": False},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(str(self.item_a.pk), r.json()["gear_checklist"])

    def test_check_multiple_items_accumulate(self) -> None:
        for item in (self.item_a, self.item_b):
            self.client.patch(
                self.url,
                {"item_id": item.pk, "is_checked": True},
                format="json",
            )
        self.rsvp.refresh_from_db()
        self.assertEqual(
            set(self.rsvp.gear_checklist.keys()),
            {str(self.item_a.pk), str(self.item_b.pk)},
        )

    def test_invalid_item_id_400(self) -> None:
        r = self.client.patch(
            self.url,
            {"item_id": "not-a-number", "is_checked": True},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("item_id", r.json())

    def test_unknown_item_id_persists_anyway(self) -> None:
        # Endpoint záměrně nevaliduje item_id proti recommended_gear_list
        # (FE jen ukazuje real items, stale id v JSONu neuškodí). Test
        # zaznamenává tuhle behavior aby budoucí refactor nevěděl o
        # tom co změnit.
        r = self.client.patch(
            self.url,
            {"item_id": 99999, "is_checked": True},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("99999", r.json()["gear_checklist"])

    def test_no_rsvp_404(self) -> None:
        # User bez RSVP na akci nemůže ukládat gear stav.
        random_user = _make_user("r@gc.com")
        self.client.force_authenticate(random_user)
        r = self.client.patch(
            self.url,
            {"item_id": self.item_a.pk, "is_checked": True},
            format="json",
        )
        self.assertEqual(r.status_code, 404)

    def test_anon_blocked(self) -> None:
        client = APIClient()
        r = client.patch(
            self.url,
            {"item_id": self.item_a.pk, "is_checked": True},
            format="json",
        )
        self.assertIn(r.status_code, (401, 403))

    def test_unknown_event_404(self) -> None:
        r = self.client.patch(
            reverse(
                "events:rsvp-gear-checklist",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": "neexistuje",
                },
            ),
            {"item_id": self.item_a.pk, "is_checked": True},
            format="json",
        )
        self.assertEqual(r.status_code, 404)

    def test_other_users_state_unaffected(self) -> None:
        # Druhý participant — jejich gear_checklist musí být izolovaný.
        other = _make_user("other@gc.com")
        other_rsvp = RSVP.objects.create(
            event=self.event, user=other, status=RSVP.STATUS_YES
        )
        self.client.patch(
            self.url,
            {"item_id": self.item_a.pk, "is_checked": True},
            format="json",
        )
        other_rsvp.refresh_from_db()
        self.assertEqual(other_rsvp.gear_checklist, {})


class DuplicateEventCopiesGearListTests(TestCase):
    """`duplicate_event` view kopíruje recommended_gear_list FK (vedle
    blocks, cover, atd.) — tahle test fixuje tu vlastnost aby budoucí
    refactor nepustil ji upadnout do default-null."""

    def setUp(self) -> None:
        self.owner = _make_user("o@dup.com")
        self.ws = _make_workspace(self.owner, slug="dupws")
        gear_list = GearList.objects.create(user=self.owner, name="Pack")
        item = GearItem.objects.create(user=self.owner, name="Boots")
        GearListItem.objects.create(gear_list=gear_list, item=item)
        starts = timezone.now() + timedelta(days=14)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="original",
            title="Original",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
            recommended_gear_list=gear_list,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_duplicate_preserves_gear_list_fk(self) -> None:
        r = self.client.post(
            reverse(
                "events:duplicate",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 201)
        new_slug = r.json()["slug"]
        new_event = Event.objects.get(workspace=self.ws, slug=new_slug)
        self.assertEqual(
            new_event.recommended_gear_list,
            self.event.recommended_gear_list,
        )
