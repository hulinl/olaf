"""Invitation flow coverage — public + e-mail invitations.

Tahle cesta je hot path pro nové uživatele:
  owner pošle pozvánku → recipient klikne na link → přihlásí se /
  zaregistruje → přijme → stane se členem workspace.

Když se tu něco rozbije, uživatel sice dokončí signup, ale nikdy se
nedostane do té komunity, kam ho pozvali — frustrating dead-end.
Tabletop-z testing není pro tohle bezpečné, proto těžké test
coverage.
"""
from __future__ import annotations

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User

from .models import (
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)


def _make_user(email: str, **extra) -> User:
    defaults = {
        "password": "alpine-hike-2026",
        "first_name": extra.pop("first_name", "X"),
        "last_name": extra.pop("last_name", "Y"),
        "email_verified": True,
    }
    defaults.update(extra)
    return User.objects.create_user(email=email, **defaults)


def _make_workspace(owner: User, slug: str = "ws", **extra) -> Workspace:
    extra.setdefault("name", slug.title())
    ws = Workspace.objects.create(slug=slug, **extra)
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


class InvitationLookupTests(TestCase):
    """`GET /api/workspaces/invitations/<token>/lookup/` is the public
    pre-accept fetch — anonymous user lands on the accept page and
    needs to know who/what invited them before signing up."""

    def setUp(self) -> None:
        self.owner = _make_user("o@inv.com", first_name="Owner", last_name="One")
        self.ws = _make_workspace(self.owner, slug="invws", name="InvWS", bio="A nice party")
        self.invitation = WorkspaceInvitation.objects.create(
            workspace=self.ws,
            email="newbie@inv.com",
            invited_by=self.owner,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "workspaces:invitation-lookup",
            kwargs={"token": self.invitation.token},
        )

    def test_anon_can_lookup(self) -> None:
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["email"], "newbie@inv.com")
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["workspace"]["slug"], "invws")
        self.assertEqual(data["workspace"]["name"], "InvWS")
        self.assertEqual(data["workspace"]["bio"], "A nice party")
        self.assertEqual(data["invited_by_name"], "Owner One")

    def test_unknown_token_404(self) -> None:
        r = self.client.get(
            reverse(
                "workspaces:invitation-lookup",
                kwargs={"token": "totally-fake-token"},
            )
        )
        self.assertEqual(r.status_code, 404)


class InvitationAcceptTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@acc.com")
        self.invitee = _make_user("invitee@acc.com")
        self.ws = _make_workspace(self.owner, slug="accws")
        self.invitation = WorkspaceInvitation.objects.create(
            workspace=self.ws,
            email="invitee@acc.com",
            invited_by=self.owner,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()

    def _url(self, token: str | None = None) -> str:
        return reverse(
            "workspaces:invitation-accept",
            kwargs={"token": token or self.invitation.token},
        )

    def test_anon_rejected(self) -> None:
        r = self.client.post(self._url())
        self.assertIn(r.status_code, (401, 403))

    def test_correct_user_accepts(self) -> None:
        self.client.force_authenticate(self.invitee)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["workspace_slug"], "accws")
        # Invitation flipped to accepted with audit pointers.
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, "accepted")
        self.assertEqual(self.invitation.accepted_by, self.invitee)
        self.assertIsNotNone(self.invitation.accepted_at)
        # Membership created with the role from the invitation.
        membership = WorkspaceMember.objects.get(
            workspace=self.ws, user=self.invitee
        )
        self.assertEqual(membership.role, "member")

    def test_wrong_email_403(self) -> None:
        # Different user (different e-mail) klikne na cizí pozvánku.
        # Útok / mistake — odmítnuto.
        other = _make_user("imposter@acc.com")
        self.client.force_authenticate(other)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 403)
        # Membership NEPROBĚHLA.
        self.assertFalse(
            WorkspaceMember.objects.filter(
                workspace=self.ws, user=other
            ).exists(),
        )

    def test_email_match_is_case_insensitive(self) -> None:
        # Invitation e-mail = "invitee@acc.com" (lowercase). User
        # zaregistrován se stejným e-mailem ale různým casingem by
        # měl být akceptován.
        upper = _make_user("Other@acc.com")
        invite = WorkspaceInvitation.objects.create(
            workspace=self.ws,
            email="OTHER@acc.com",
            invited_by=self.owner,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client.force_authenticate(upper)
        r = self.client.post(
            self._url(token=invite.token),
        )
        self.assertEqual(r.status_code, 200)

    def test_already_accepted_410(self) -> None:
        self.invitation.status = WorkspaceInvitation.STATUS_ACCEPTED
        self.invitation.save(update_fields=["status"])
        self.client.force_authenticate(self.invitee)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 410)

    def test_cancelled_invitation_410(self) -> None:
        self.invitation.status = WorkspaceInvitation.STATUS_CANCELLED
        self.invitation.save(update_fields=["status"])
        self.client.force_authenticate(self.invitee)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 410)

    def test_unknown_token_404(self) -> None:
        self.client.force_authenticate(self.invitee)
        r = self.client.post(self._url(token="bogus"))
        self.assertEqual(r.status_code, 404)

    def test_idempotent_membership_get_or_create(self) -> None:
        # Když už user je členem (z dřívějšího bulk-add), accept
        # nezdvojuje membership ale flipne invitation jako accepted.
        WorkspaceMember.objects.create(
            workspace=self.ws,
            user=self.invitee,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client.force_authenticate(self.invitee)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.ws, user=self.invitee
            ).count(),
            1,
        )
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, "accepted")


class InvitationDetailDeleteTests(TestCase):
    """`DELETE /api/workspaces/<ws>/invitations/<id>/` cancels a
    pending invitation. Owner-only."""

    def setUp(self) -> None:
        self.owner = _make_user("o@del.com")
        self.member = _make_user("m@del.com")
        self.outsider = _make_user("x@del.com")
        self.ws = _make_workspace(self.owner, slug="delws")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.member, role=WorkspaceMember.ROLE_MEMBER
        )
        self.invitation = WorkspaceInvitation.objects.create(
            workspace=self.ws,
            email="pending@del.com",
            invited_by=self.owner,
            role=WorkspaceMember.ROLE_MEMBER,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "workspaces:invitation-detail",
            kwargs={"slug": self.ws.slug, "invitation_id": self.invitation.pk},
        )

    def test_owner_cancels(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, "cancelled")

    def test_non_owner_member_blocked(self) -> None:
        self.client.force_authenticate(self.member)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 403)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 403)

    def test_cancelling_already_accepted_is_noop(self) -> None:
        # Once accepted, "cancel" je no-op (status už není pending).
        # Endpoint je idempotentní — vrátí 204 ale row se nezmění.
        self.invitation.status = WorkspaceInvitation.STATUS_ACCEPTED
        self.invitation.save(update_fields=["status"])
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, "accepted")

    def test_unknown_invitation_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(
            reverse(
                "workspaces:invitation-detail",
                kwargs={"slug": self.ws.slug, "invitation_id": 99999},
            )
        )
        self.assertEqual(r.status_code, 404)


class PublicInviteLinkTests(TestCase):
    """`workspace.public_invite_token` driven self-join. Anyone with the
    URL může vstoupit, nikdo nemusí schvalovat."""

    def setUp(self) -> None:
        self.owner = _make_user("o@pub.com")
        self.joiner = _make_user("j@pub.com")
        self.ws = _make_workspace(
            self.owner,
            slug="pubws",
            public_invite_token="abc123xyz",
        )
        self.client = APIClient()

    def test_anon_can_lookup(self) -> None:
        r = self.client.get(
            reverse(
                "workspaces:public-invite-lookup",
                kwargs={"token": "abc123xyz"},
            )
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["workspace"]["slug"], "pubws")

    def test_unknown_token_404(self) -> None:
        r = self.client.get(
            reverse(
                "workspaces:public-invite-lookup",
                kwargs={"token": "notreal"},
            )
        )
        self.assertEqual(r.status_code, 404)

    def test_authed_user_joins_as_member(self) -> None:
        self.client.force_authenticate(self.joiner)
        r = self.client.post(
            reverse(
                "workspaces:public-invite-accept",
                kwargs={"token": "abc123xyz"},
            )
        )
        self.assertEqual(r.status_code, 200)
        membership = WorkspaceMember.objects.get(
            workspace=self.ws, user=self.joiner
        )
        self.assertEqual(membership.role, "member")

    def test_anon_blocked_from_accept(self) -> None:
        r = self.client.post(
            reverse(
                "workspaces:public-invite-accept",
                kwargs={"token": "abc123xyz"},
            )
        )
        self.assertIn(r.status_code, (401, 403))

    def test_repeat_accept_is_idempotent(self) -> None:
        # Klikni dvakrát — pořád jen jeden membership.
        self.client.force_authenticate(self.joiner)
        self.client.post(
            reverse(
                "workspaces:public-invite-accept",
                kwargs={"token": "abc123xyz"},
            )
        )
        self.client.post(
            reverse(
                "workspaces:public-invite-accept",
                kwargs={"token": "abc123xyz"},
            )
        )
        self.assertEqual(
            WorkspaceMember.objects.filter(
                workspace=self.ws, user=self.joiner
            ).count(),
            1,
        )


class InviteLinkRotateTests(TestCase):
    """`POST /api/workspaces/<ws>/invite-link/` (toggle/rotate),
    `DELETE` (disable). Owner-only management of the public invite
    token."""

    def setUp(self) -> None:
        self.owner = _make_user("o@rot.com")
        self.outsider = _make_user("x@rot.com")
        self.ws = _make_workspace(self.owner, slug="rotws")
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "workspaces:invite-link",
            kwargs={"slug": self.ws.slug},
        )

    def test_owner_creates_token(self) -> None:
        self.assertEqual(self.ws.public_invite_token, "")
        self.client.force_authenticate(self.owner)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertTrue(self.ws.public_invite_token)
        # Endpoint vrací token v body.
        self.assertEqual(
            r.json()["public_invite_token"], self.ws.public_invite_token
        )

    def test_owner_rotates_token(self) -> None:
        # Druhý POST vygeneruje nový token a starý invaliduje.
        self.client.force_authenticate(self.owner)
        self.client.post(self._url())
        self.ws.refresh_from_db()
        original = self.ws.public_invite_token
        r = self.client.post(self._url())
        self.ws.refresh_from_db()
        self.assertNotEqual(self.ws.public_invite_token, original)
        self.assertEqual(
            r.json()["public_invite_token"], self.ws.public_invite_token
        )

    def test_owner_disables_token(self) -> None:
        self.client.force_authenticate(self.owner)
        self.client.post(self._url())
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 200)
        self.ws.refresh_from_db()
        self.assertEqual(self.ws.public_invite_token, "")

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self._url())
        self.assertEqual(r.status_code, 403)


class InvitationCreateSendsEmailTests(TestCase):
    """`POST /api/workspaces/<ws>/invitations/` vytvoří invitaci A
    pošle e-mail. Konkrétní obsah e-mailu otestujeme separátně, tady
    jen ověříme, že byl odeslán."""

    def setUp(self) -> None:
        self.owner = _make_user("o@em.com", first_name="Olaf", last_name="Hulin")
        self.ws = _make_workspace(self.owner, slug="emws")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        mail.outbox.clear()

    def test_owner_creates_invitation_and_email_sent(self) -> None:
        r = self.client.post(
            reverse("workspaces:invitations", kwargs={"slug": self.ws.slug}),
            data={"email": "new@em.com"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.json())
        # Invitation row created with pending status.
        invite = WorkspaceInvitation.objects.get(
            workspace=self.ws, email="new@em.com"
        )
        self.assertEqual(invite.status, "pending")
        self.assertEqual(invite.invited_by, self.owner)
        # Token vygenerovaný, ne prázdný.
        self.assertTrue(invite.token)
        # E-mail odeslaný (sync ne queue v testech).
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("new@em.com", mail.outbox[0].to)

    def test_duplicate_invitation_does_not_send_second_email(self) -> None:
        # Druhý POST na stejný e-mail by neměl spawnovat duplikátní
        # invitaci ani spamovat e-mail.
        self.client.post(
            reverse("workspaces:invitations", kwargs={"slug": self.ws.slug}),
            data={"email": "same@em.com"},
            format="json",
        )
        outbox_count_after_first = len(mail.outbox)
        r = self.client.post(
            reverse("workspaces:invitations", kwargs={"slug": self.ws.slug}),
            data={"email": "same@em.com"},
            format="json",
        )
        # 200 OK with existing invitation, žádný nový e-mail.
        self.assertIn(r.status_code, (200, 201))
        self.assertEqual(
            WorkspaceInvitation.objects.filter(
                workspace=self.ws, email="same@em.com"
            ).count(),
            1,
        )
        # Žádný extra outbox row.
        self.assertEqual(len(mail.outbox), outbox_count_after_first)
