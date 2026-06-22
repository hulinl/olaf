"""V2 explicit community membership coverage (PR #212).

V1 derived members from RSVPs. V2 makes them explicit
(WorkspaceMember rows with role=member, status=active). These tests
hold the contract for the three endpoints that drive the new
workflow:

- workspace_members (GET) — pulls active rows from WorkspaceMember,
  ignores RSVPs that don't have a backing member row
- workspace_participants (GET) — surfaces the inverse: RSVPed users
  who AREN'T active members yet, so the owner can promote them
- workspace_add_existing_member (POST) — bulk-add the candidates
  picked from participants
- workspace_member_remove (POST) — flip status to removed; the row
  stays so we can re-activate it later

Backfill is covered indirectly: the test database boots with the V2
migrations applied; we set up data the V1 way (only RSVP, no
membership row) and verify the new endpoints behave as advertised.
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event

from .models import Workspace, WorkspaceMember


def _make_user(email: str, **extra) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name=extra.pop("first_name", "X"),
        last_name=extra.pop("last_name", "Y"),
        email_verified=True,
        **extra,
    )


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, **kwargs) -> Event:
    starts = kwargs.pop("starts_at", timezone.now() + timedelta(days=30))
    return Event.objects.create(
        workspace=ws,
        slug=kwargs.pop("slug", "ev"),
        title=kwargs.pop("title", "Event"),
        starts_at=starts,
        ends_at=kwargs.pop("ends_at", starts + timedelta(hours=4)),
        status=Event.STATUS_PUBLISHED,
        **kwargs,
    )


class MembersListTests(TestCase):
    """workspace_members teď vrací jen explicit active members, ne
    RSVP-derived seznam."""

    def setUp(self) -> None:
        self.owner = _make_user("o@v2.test")
        self.ws = _make_workspace(self.owner, slug="v2-ws")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse("workspaces:members", kwargs={"slug": self.ws.slug})

    def test_members_includes_only_active(self) -> None:
        active = _make_user("active@v2.test", first_name="Aktivní")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=active,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        removed = _make_user("removed@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=removed,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_REMOVED,
        )
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        ids = {row["id"] for row in r.json()}
        self.assertIn(self.owner.id, ids)
        self.assertIn(active.id, ids)
        self.assertNotIn(removed.id, ids)

    def test_rsvp_without_membership_excluded(self) -> None:
        """V2 invariant: RSVP-er bez membership row se NEzobrazuje
        v members listingu (musí být explicitně přidán)."""
        ev = _make_event(self.ws, slug="rsvp-only")
        participant = _make_user("ghost@v2.test", first_name="Duch")
        RSVP.objects.create(
            event=ev, user=participant, status=RSVP.STATUS_YES
        )
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        ids = {row["id"] for row in r.json()}
        self.assertNotIn(participant.id, ids)

    def test_member_row_carries_rsvp_stats(self) -> None:
        """Explicitní member s RSVPs vidí počítané statistiky."""
        ev1 = _make_event(self.ws, slug="up", starts_at=timezone.now() + timedelta(days=10))
        ev2 = _make_event(self.ws, slug="past", starts_at=timezone.now() - timedelta(days=10), ends_at=timezone.now() - timedelta(days=9))
        user = _make_user("stats@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=user,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        RSVP.objects.create(event=ev1, user=user, status=RSVP.STATUS_YES)
        RSVP.objects.create(event=ev2, user=user, status=RSVP.STATUS_YES)
        r = self.client.get(self.url)
        row = next(x for x in r.json() if x["id"] == user.id)
        self.assertEqual(row["total_rsvps"], 2)
        self.assertEqual(row["upcoming_rsvps"], 1)
        self.assertEqual(row["past_rsvps"], 1)


class ParticipantsListTests(TestCase):
    """workspace_participants = RSVPeři kteří NEJSOU active member."""

    def setUp(self) -> None:
        self.owner = _make_user("o2@v2.test")
        self.ws = _make_workspace(self.owner, slug="v2-p")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse("workspaces:participants", kwargs={"slug": self.ws.slug})

    def test_returns_rsvpers_only(self) -> None:
        ev = _make_event(self.ws, slug="ev")
        rsvper = _make_user("p@v2.test", first_name="Petr")
        RSVP.objects.create(event=ev, user=rsvper, status=RSVP.STATUS_YES)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        ids = {row["id"] for row in r.json()}
        self.assertEqual(ids, {rsvper.id})
        # Owner sám se mezi participants neukáže (je active member).
        self.assertNotIn(self.owner.id, ids)

    def test_excludes_active_members(self) -> None:
        ev = _make_event(self.ws, slug="ev2")
        user = _make_user("both@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=user,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        RSVP.objects.create(event=ev, user=user, status=RSVP.STATUS_YES)
        r = self.client.get(self.url)
        ids = {row["id"] for row in r.json()}
        self.assertNotIn(user.id, ids)

    def test_excludes_removed_member_with_rsvp(self) -> None:
        """Removed members nesmí přijít v participants — jsou v separátní
        /removed-members/ sekci. Owner je explicitně odebral; zařadit
        je do "Přidat do komunity" kandidátů by mátlo (vypadalo by to
        jako "nikdy nebyli členové")."""
        ev = _make_event(self.ws, slug="ev3")
        user = _make_user("comeback@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=user,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_REMOVED,
        )
        RSVP.objects.create(event=ev, user=user, status=RSVP.STATUS_YES)
        r = self.client.get(self.url)
        ids = {row["id"] for row in r.json()}
        self.assertNotIn(user.id, ids)

    def test_removed_members_endpoint_lists_removed(self) -> None:
        """Separátní /removed-members/ endpoint vrací explicitně
        odebrané členy — pro "Odebraní členové" collapsible sekci v UI
        (undo flow)."""
        user = _make_user("undo@v2.test", first_name="Bývalý")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=user,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_REMOVED,
        )
        # Active member nesmí mít v této sekci místo.
        active = _make_user("active@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=active,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )

        url = reverse(
            "workspaces:removed-members", kwargs={"slug": self.ws.slug}
        )
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200, r.content)
        ids = {row["id"] for row in r.json()}
        self.assertEqual(ids, {user.id})


class AddMemberTests(TestCase):
    """workspace_add_existing_member přepnutý na bulk + reactivation."""

    def setUp(self) -> None:
        self.owner = _make_user("o3@v2.test")
        self.ws = _make_workspace(self.owner, slug="v2-add")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse(
            "workspaces:add-existing-member", kwargs={"slug": self.ws.slug}
        )

    def test_bulk_add_creates_members(self) -> None:
        a = _make_user("a@v2.test")
        b = _make_user("b@v2.test")
        r = self.client.post(self.url, {"user_ids": [a.id, b.id]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(sorted(body["added"]), sorted([a.id, b.id]))
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.ws,
                status=WorkspaceMember.STATUS_ACTIVE,
            ).count(),
            3,  # owner + a + b
        )

    def test_reactivates_removed_member(self) -> None:
        ghost = _make_user("ghost@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=ghost,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_REMOVED,
        )
        r = self.client.post(self.url, {"user_ids": [ghost.id]}, format="json")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["reactivated"], [ghost.id])
        ghost_member = WorkspaceMember.objects.get(workspace=self.ws, user=ghost)
        self.assertEqual(ghost_member.status, WorkspaceMember.STATUS_ACTIVE)

    def test_legacy_single_user_id_shape_preserved(self) -> None:
        """Existující frontend volá { user_id: X } — endpoint pořád
        funguje, vrací legacy single-row shape."""
        u = _make_user("legacy@v2.test")
        r = self.client.post(self.url, {"user_id": u.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["user_id"], u.id)
        self.assertEqual(body["role"], WorkspaceMember.ROLE_MEMBER)
        self.assertTrue(body["created"])

    def test_non_owner_forbidden(self) -> None:
        outsider = _make_user("out@v2.test")
        client = APIClient()
        client.force_authenticate(outsider)
        u = _make_user("z@v2.test")
        r = client.post(self.url, {"user_ids": [u.id]}, format="json")
        self.assertEqual(r.status_code, 403)


class RemoveMemberTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o4@v2.test")
        self.ws = _make_workspace(self.owner, slug="v2-rm")
        self.member = _make_user("m@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.member,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def _url(self, user_id: int) -> str:
        return reverse(
            "workspaces:member-remove",
            kwargs={"slug": self.ws.slug, "user_id": user_id},
        )

    def test_removes_member(self) -> None:
        r = self.client.post(self._url(self.member.id))
        self.assertEqual(r.status_code, 204)
        m = WorkspaceMember.objects.get(workspace=self.ws, user=self.member)
        self.assertEqual(m.status, WorkspaceMember.STATUS_REMOVED)

    def test_idempotent_on_already_removed(self) -> None:
        WorkspaceMember.objects.filter(
            workspace=self.ws, user=self.member
        ).update(status=WorkspaceMember.STATUS_REMOVED)
        r = self.client.post(self._url(self.member.id))
        self.assertEqual(r.status_code, 204)

    def test_cannot_remove_owner(self) -> None:
        r = self.client.post(self._url(self.owner.id))
        # Owner ochrání nejdřív self-check (sebe nemůže odebrat).
        self.assertEqual(r.status_code, 400)

    def test_cannot_remove_self(self) -> None:
        """Owner se nesmí self-remove ani když by formálně byl 'member'.
        Sanity-check guard duplikuje (owner check + self check) — chci
        vidět self check zvlášť."""
        co_owner = _make_user("co@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=co_owner,
            role=WorkspaceMember.ROLE_MEMBER,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        client = APIClient()
        client.force_authenticate(co_owner)
        # co_owner není super-admin, vidí 403 dřív než self-check.
        r = client.post(self._url(co_owner.id))
        self.assertEqual(r.status_code, 403)

    def test_cannot_remove_admin_without_demote(self) -> None:
        admin = _make_user("admin@v2.test")
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=admin,
            role=WorkspaceMember.ROLE_ADMIN,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        r = self.client.post(self._url(admin.id))
        self.assertEqual(r.status_code, 400)
        self.assertIn("Admina", r.json()["detail"])

    def test_unknown_user_404(self) -> None:
        r = self.client.post(self._url(999999))
        self.assertEqual(r.status_code, 404)
