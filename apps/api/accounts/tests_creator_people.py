"""Creator-side people directory — `GET /api/auth/me/people/` +
`GET /api/auth/me/people/<user_id>/`.

Owner sees aggregated participant roster across všechny workspaces
kde je owner. Hot endpoint pro Lidé sekci cockpitu.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember

from .models import User


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


def _make_workspace_and_event(owner: User, slug: str = "ws") -> Event:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=f"{slug}-ev",
        title=f"Event {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


class CreatorPeopleListTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cp.com")
        self.event = _make_workspace_and_event(self.owner, slug="cpws")
        # Three RSVPed users.
        self.p1 = _make_user("p1@cp.com", first_name="Alice", last_name="A")
        self.p2 = _make_user("p2@cp.com", first_name="Bob", last_name="B")
        self.p3 = _make_user("p3@cp.com", first_name="Carol", last_name="C")
        RSVP.objects.create(event=self.event, user=self.p1, status=RSVP.STATUS_YES)
        RSVP.objects.create(event=self.event, user=self.p2, status=RSVP.STATUS_YES)
        RSVP.objects.create(
            event=self.event, user=self.p3, status=RSVP.STATUS_CANCELLED
        )
        self.client = APIClient()
        self.url = reverse("accounts:creator-people")

    def test_anon_blocked(self) -> None:
        r = self.client.get(self.url)
        self.assertIn(r.status_code, (401, 403))

    def test_owner_sees_active_rsvpers(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        emails = [row["email"] for row in r.json()]
        # p1 + p2 yes — visible. p3 cancelled — hidden.
        self.assertIn("p1@cp.com", emails)
        self.assertIn("p2@cp.com", emails)
        self.assertNotIn("p3@cp.com", emails)

    def test_non_owner_returns_empty(self) -> None:
        non_owner = _make_user("x@cp.com")
        self.client.force_authenticate(non_owner)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_event_count_aggregated_across_workspace_events(self) -> None:
        # Vytvoříme druhou akci ve stejném workspace + p1 ji RSVP.
        starts = timezone.now() + timedelta(days=21)
        second_event = Event.objects.create(
            workspace=self.event.workspace,
            slug="cpws-ev2",
            title="Second",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        RSVP.objects.create(
            event=second_event, user=self.p1, status=RSVP.STATUS_YES
        )
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        rows_by_email = {row["email"]: row for row in r.json()}
        # p1 byl na 2 akcích, p2 na 1.
        self.assertEqual(rows_by_email["p1@cp.com"]["event_count"], 2)
        self.assertEqual(rows_by_email["p2@cp.com"]["event_count"], 1)

    def test_foreign_workspace_rsvps_dont_leak(self) -> None:
        # Druhý owner s vlastním workspace + RSVPed user.
        other_owner = _make_user("o2@cp.com")
        other_event = _make_workspace_and_event(other_owner, slug="otherws")
        foreign_user = _make_user("foreign@cp.com")
        RSVP.objects.create(
            event=other_event, user=foreign_user, status=RSVP.STATUS_YES
        )
        # Naš owner volá endpoint — foreign user NESMÍ být v listu.
        self.client.force_authenticate(self.owner)
        r = self.client.get(self.url)
        emails = [row["email"] for row in r.json()]
        self.assertNotIn("foreign@cp.com", emails)


class CreatorPersonDetailTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cpd.com")
        self.outsider = _make_user("x@cpd.com")
        self.event = _make_workspace_and_event(self.owner, slug="cpdws")
        self.participant = _make_user(
            "p@cpd.com", first_name="Petr", last_name="Skála"
        )
        RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.client = APIClient()

    def _url(self, pk: int | None = None) -> str:
        return reverse(
            "accounts:creator-person-detail",
            kwargs={"user_id": pk or self.participant.pk},
        )

    def test_owner_sees_person_with_rsvp_history(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["email"], "p@cpd.com")
        self.assertEqual(data["first_name"], "Petr")
        # RSVP history obsahuje aspoň jednu položku z naších eventů.
        self.assertGreaterEqual(len(data.get("events", [])), 1)

    def test_outsider_404_no_shared_events(self) -> None:
        # Outsider nemá žádný workspace s tímto participant → 404
        # (žádné shared RSVPs, "nemet meets" person).
        self.client.force_authenticate(self.outsider)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 404)

    def test_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(pk=99999))
        self.assertEqual(r.status_code, 404)

    def test_anon_blocked(self) -> None:
        r = self.client.get(self._url())
        self.assertIn(r.status_code, (401, 403))

    def test_memberships_field_shows_caller_owned_workspaces_only(self) -> None:
        """V2 — endpoint vrací memberships array. Ukazují se jen
        WorkspaceMember rows ve workspaces, které caller VLASTNÍ.
        Membership v cizí workspace (kde caller není owner) se NESMÍ
        zobrazit, jinak by Lidé view leakovala napříč tenants."""
        from workspaces.models import Workspace, WorkspaceMember

        # Foreign workspace s membership pro participanta — ale caller
        # není její vlastník, takže by se ve výpisu zobrazit NESMĚLA.
        foreign_owner = _make_user("foreign@cpd.com")
        foreign_ws = Workspace.objects.create(
            slug="foreign-ws", name="Foreign WS"
        )
        WorkspaceMember.objects.create(
            workspace=foreign_ws,
            user=foreign_owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        WorkspaceMember.objects.create(
            workspace=foreign_ws,
            user=self.participant,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        # Active membership v owner-ově workspace, aby tam byla aspoň
        # jedna položka pro pozitivní check.
        own_ws = self.event.workspace
        WorkspaceMember.objects.create(
            workspace=own_ws,
            user=self.participant,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )

        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200, r.content)
        memberships = r.json().get("memberships", [])
        slugs = {m["workspace_slug"] for m in memberships}
        self.assertIn(own_ws.slug, slugs)
        self.assertNotIn(foreign_ws.slug, slugs)

    def test_hide_excludes_from_creator_people(self) -> None:
        """POST /hide/ → user zmizí z creator_people. DELETE /hide/ ho
        vrátí. Hidden je per-caller — jiný owner vidí osobu dál."""
        from .models import OwnerHiddenPerson

        self.client.force_authenticate(self.owner)
        list_url = reverse("accounts:creator-people")
        hide_url = reverse(
            "accounts:creator-person-hide",
            kwargs={"user_id": self.participant.pk},
        )

        # Před skrytím se osoba v listě objeví
        before = {p["user_id"] for p in self.client.get(list_url).json()}
        self.assertIn(self.participant.id, before)

        # Skrytí
        r = self.client.post(hide_url)
        self.assertEqual(r.status_code, 204)
        self.assertTrue(
            OwnerHiddenPerson.objects.filter(
                owner=self.owner, target=self.participant
            ).exists()
        )

        after = {p["user_id"] for p in self.client.get(list_url).json()}
        self.assertNotIn(self.participant.id, after)

        # Hidden endpoint je vidí
        hidden_url = reverse("accounts:creator-hidden-people")
        hidden = self.client.get(hidden_url).json()
        self.assertEqual(len(hidden), 1)
        self.assertEqual(hidden[0]["user_id"], self.participant.id)

        # Unhide vrátí
        r = self.client.delete(hide_url)
        self.assertEqual(r.status_code, 204)
        restored = {p["user_id"] for p in self.client.get(list_url).json()}
        self.assertIn(self.participant.id, restored)

    def test_hide_is_per_caller(self) -> None:
        """Hide owner-em A neovlivní co vidí owner B."""
        from workspaces.models import Workspace, WorkspaceMember

        other_owner = _make_user("o2@cpd.com")
        ws_b = Workspace.objects.create(slug="cpd-b", name="B")
        WorkspaceMember.objects.create(
            workspace=ws_b,
            user=other_owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        # Sdílím participanta s druhým ownerem skrz RSVP
        from datetime import timedelta as _td

        from events.models import RSVP as _R
        from events.models import Event as _E

        starts = timezone.now() + _td(days=30)
        ev_b = _E.objects.create(
            workspace=ws_b,
            slug="b-ev",
            title="B ev",
            starts_at=starts,
            ends_at=starts + _td(hours=4),
            status=_E.STATUS_PUBLISHED,
        )
        _R.objects.create(event=ev_b, user=self.participant, status=_R.STATUS_YES)

        # Owner A skryje participanta
        self.client.force_authenticate(self.owner)
        hide_url = reverse(
            "accounts:creator-person-hide",
            kwargs={"user_id": self.participant.pk},
        )
        self.client.post(hide_url)

        # Owner B pořád vidí participanta (jeho hide list je prázdný)
        list_url = reverse("accounts:creator-people")
        client_b = APIClient()
        client_b.force_authenticate(other_owner)
        ids_b = {p["user_id"] for p in client_b.get(list_url).json()}
        self.assertIn(self.participant.id, ids_b)

    def test_cannot_hide_self(self) -> None:
        self.client.force_authenticate(self.owner)
        url = reverse(
            "accounts:creator-person-hide",
            kwargs={"user_id": self.owner.pk},
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 400)

    def test_purge_cascades_caller_scoped_data(self) -> None:
        """POST /purge/ cascades:
        - non-cancelled RSVPs na caller's eventech se zruší
        - PersonProfile (workspace-scoped, caller's) zmizí
        - WorkspaceMember rows v caller's workspaces zmizí (non-admin)
        - OwnerHiddenPerson row zmizí
        Účet samotný + jiných ownerů data zůstávají nedotčená."""
        from workspaces.models import PersonProfile, WorkspaceMember

        from .models import OwnerHiddenPerson

        own_ws = self.event.workspace
        # Setup: RSVP, profile, membership, hidden marker
        profile = PersonProfile.objects.create(
            workspace=own_ws,
            user=self.participant,
            note="ujasnit dietu před akcí",
        )
        WorkspaceMember.objects.create(
            workspace=own_ws,
            user=self.participant,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        OwnerHiddenPerson.objects.create(
            owner=self.owner, target=self.participant
        )
        rsvp_id = (
            RSVP.objects.filter(user=self.participant).first().id
        )

        # Foreign workspace dat (jiný owner) — nesmí být dotčená
        from workspaces.models import Workspace

        foreign_owner = _make_user("foreign-purge@cpd.com")
        foreign_ws = Workspace.objects.create(
            slug="fp-purge", name="FP"
        )
        WorkspaceMember.objects.create(
            workspace=foreign_ws,
            user=foreign_owner,
            role=WorkspaceMember.ROLE_OWNER,
        )
        foreign_ev = _make_workspace_and_event(
            foreign_owner, slug="fpws"
        )
        foreign_rsvp = RSVP.objects.create(
            event=foreign_ev,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )

        # Purge
        self.client.force_authenticate(self.owner)
        purge_url = reverse(
            "accounts:creator-person-purge",
            kwargs={"user_id": self.participant.pk},
        )
        r = self.client.post(purge_url)
        self.assertEqual(r.status_code, 204, r.content)

        # Caller's data: scrubbed
        self.assertFalse(
            PersonProfile.objects.filter(pk=profile.pk).exists()
        )
        self.assertFalse(
            WorkspaceMember.objects.filter(
                workspace=own_ws, user=self.participant
            ).exists()
        )
        self.assertFalse(
            OwnerHiddenPerson.objects.filter(
                owner=self.owner, target=self.participant
            ).exists()
        )
        own_rsvp = RSVP.objects.get(pk=rsvp_id)
        self.assertEqual(own_rsvp.status, RSVP.STATUS_CANCELLED)

        # Foreign owner's data: nedotčená
        foreign_rsvp.refresh_from_db()
        self.assertEqual(foreign_rsvp.status, RSVP.STATUS_YES)

        # Account stále existuje
        self.assertTrue(
            User.objects.filter(pk=self.participant.pk).exists()
        )

    def test_purge_protects_admin_membership(self) -> None:
        """Admin nesmí být auto-purgnut — owner musí nejdřív demote.
        Guard proti accidental nuke explicit role."""
        from workspaces.models import WorkspaceMember

        own_ws = self.event.workspace
        WorkspaceMember.objects.create(
            workspace=own_ws,
            user=self.participant,
            role=WorkspaceMember.ROLE_ADMIN,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        self.client.force_authenticate(self.owner)
        purge_url = reverse(
            "accounts:creator-person-purge",
            kwargs={"user_id": self.participant.pk},
        )
        r = self.client.post(purge_url)
        self.assertEqual(r.status_code, 204)
        # Admin membership zůstal — guard zafungoval.
        self.assertTrue(
            WorkspaceMember.objects.filter(
                workspace=own_ws,
                user=self.participant,
                role=WorkspaceMember.ROLE_ADMIN,
            ).exists()
        )

    def test_cannot_purge_self(self) -> None:
        self.client.force_authenticate(self.owner)
        url = reverse(
            "accounts:creator-person-purge",
            kwargs={"user_id": self.owner.pk},
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 400)

    def test_hide_unknown_user_404(self) -> None:
        self.client.force_authenticate(self.owner)
        url = reverse(
            "accounts:creator-person-hide",
            kwargs={"user_id": 999999},
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 404)

    def test_404_for_membership_only_person(self) -> None:
        """Person bez RSVPs ale s membership row by se měl dát najít
        (jinak owner nemůže odebrat membera který nikdy nic neRSVPnul,
        např. propagated z bulk invite)."""
        from workspaces.models import WorkspaceMember

        non_rsvper = _make_user("nonrsvp@cpd.com")
        WorkspaceMember.objects.create(
            workspace=self.event.workspace,
            user=non_rsvper,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        self.client.force_authenticate(self.owner)
        r = self.client.get(self._url(pk=non_rsvper.pk))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["email"], "nonrsvp@cpd.com")
