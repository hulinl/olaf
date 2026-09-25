"""Testy fan-outu „nová přihláška" k organizátorům.

`notify_rsvp_created` musí:
- Vytvořit Notification řádek pro workspace owner + všechny
  `EventCollaborator`ky.
- Poslat e-mail (přes `send_rsvp_new_to_organizers_task`, který v
  testech běží EAGER) každému adresátovi.
- Skip pro organizer auto-registraci (`rsvp.is_organizer=True`).
- Skip self-notification, když se přihlásí user, který je zároveň
  owner nebo collaborator.
- Kryt per-status copy (STATUS_YES / STATUS_PENDING_APPROVAL /
  STATUS_WAITLIST).
"""
from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from events.models import RSVP, Event, EventCollaborator
from events.notifications import notify_rsvp_created
from notifications.models import Notification
from workspaces.models import Workspace, WorkspaceMember


def _user(email: str, **kwargs) -> User:
    return User.objects.create_user(
        email=email,
        password="pass-abcdef-1234",
        first_name=email.split("@")[0].capitalize(),
        last_name="X",
        email_verified=True,
        **kwargs,
    )


def _build_event(ws: Workspace, **overrides) -> Event:
    starts = timezone.now() + timedelta(days=14)
    defaults = {
        "slug": "test-akce",
        "title": "Test akce",
        "starts_at": starts,
        "ends_at": starts + timedelta(hours=6),
        "status": Event.STATUS_PUBLISHED,
        "capacity": 5,
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=ws, **defaults)


class RsvpNewOrganizerNotificationTests(TestCase):
    def setUp(self) -> None:
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf Adventures")
        self.owner = _user("owner@example.com")
        self.collab = _user("collab@example.com")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.event = _build_event(self.ws)
        EventCollaborator.objects.create(
            event=self.event, user=self.collab, added_by=self.owner
        )
        self.newcomer = _user("newcomer@example.com", phone="+420111")

    def _rsvp(self, user: User, *, status: str = RSVP.STATUS_YES) -> RSVP:
        return RSVP.objects.create(event=self.event, user=user, status=status)

    def test_notifies_owner_and_collaborators(self) -> None:
        """Baseline — anonymní/authenticated novácek se přihlásí,
        owner i EventCollaborator dostane bell + mail."""
        mail.outbox.clear()
        rsvp = self._rsvp(self.newcomer)

        created = notify_rsvp_created(rsvp)

        self.assertEqual(created, 2)
        # Bell entry
        bell_recipients = set(
            Notification.objects.filter(
                kind=Notification.KIND_RSVP_NEW,
                payload__rsvp_id=rsvp.id,
            ).values_list("recipient__email", flat=True)
        )
        self.assertEqual(
            bell_recipients, {"owner@example.com", "collab@example.com"}
        )
        # Mail
        recipients = {addr for m in mail.outbox for addr in m.to}
        self.assertIn("owner@example.com", recipients)
        self.assertIn("collab@example.com", recipients)
        # Participant není recipient organizátorské notifikace.
        self.assertNotIn("newcomer@example.com", recipients)

    def test_organizer_auto_registration_skipped(self) -> None:
        """Owner sám sebe přihlásí na akci (RSVP.create_for_event setne
        `is_organizer=True`) — nikdo nedostává organizátorský mail."""
        rsvp = self._rsvp(self.owner)
        rsvp.is_organizer = True
        rsvp.save(update_fields=["is_organizer"])
        mail.outbox.clear()

        created = notify_rsvp_created(rsvp)

        self.assertEqual(created, 0)
        self.assertFalse(
            Notification.objects.filter(
                kind=Notification.KIND_RSVP_NEW,
                payload__rsvp_id=rsvp.id,
            ).exists()
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_self_registration_of_owner_still_skips_owner(self) -> None:
        """Kdyby se owner přihlásil bez is_organizer flagu (weird corner
        case — třeba jako běžný účastník), aspoň sám sebe si nesmí
        notifikovat. Collaborator ho ale zpravovat musí."""
        rsvp = self._rsvp(self.owner)  # is_organizer default False
        mail.outbox.clear()

        created = notify_rsvp_created(rsvp)

        self.assertEqual(created, 1)
        bell_owner = Notification.objects.filter(
            kind=Notification.KIND_RSVP_NEW,
            recipient=self.owner,
            payload__rsvp_id=rsvp.id,
        )
        self.assertFalse(bell_owner.exists())
        bell_collab = Notification.objects.filter(
            kind=Notification.KIND_RSVP_NEW,
            recipient=self.collab,
            payload__rsvp_id=rsvp.id,
        )
        self.assertTrue(bell_collab.exists())

    def test_pending_status_copy_in_bell(self) -> None:
        """Pending přihláška vygeneruje bell entry s „ke schválení"
        headline a odpovídající body."""
        rsvp = self._rsvp(
            self.newcomer, status=RSVP.STATUS_PENDING_APPROVAL
        )
        notify_rsvp_created(rsvp)

        notif = Notification.objects.get(
            kind=Notification.KIND_RSVP_NEW,
            recipient=self.owner,
            payload__rsvp_id=rsvp.id,
        )
        self.assertIn("schválení", notif.title.lower())
        self.assertIn("čeká", notif.body.lower())

    def test_waitlist_status_copy_in_bell(self) -> None:
        rsvp = self._rsvp(self.newcomer, status=RSVP.STATUS_WAITLIST)
        notify_rsvp_created(rsvp)

        notif = Notification.objects.get(
            kind=Notification.KIND_RSVP_NEW,
            recipient=self.owner,
            payload__rsvp_id=rsvp.id,
        )
        self.assertIn("waitlist", notif.title.lower())
        self.assertIn("kapacita", notif.body.lower())

    def test_deep_link_goes_to_creator_cockpit(self) -> None:
        """Bell link vede na tvůrce cockpit akce, ne na public landing —
        owner klik nesmí skončit v participant view."""
        rsvp = self._rsvp(self.newcomer)
        notify_rsvp_created(rsvp)

        notif = Notification.objects.get(
            kind=Notification.KIND_RSVP_NEW, recipient=self.owner
        )
        self.assertEqual(
            notif.link, f"/tvurce/akce/{self.ws.slug}/{self.event.slug}"
        )

    def test_email_contains_participant_contact(self) -> None:
        """Mail organizátorovi musí obsahovat jméno + kontakt účastníka
        (e-mail, telefon). To je jádro fixu: aby vůbec věděl, s kým
        má co dělat."""
        mail.outbox.clear()
        rsvp = self._rsvp(self.newcomer)
        notify_rsvp_created(rsvp)

        owner_mail = next(m for m in mail.outbox if "owner@example.com" in m.to)
        combined = owner_mail.body + " " + str(
            owner_mail.alternatives[0][0] if owner_mail.alternatives else ""
        )
        self.assertIn("Newcomer", combined)  # jméno účastníka
        self.assertIn("newcomer@example.com", combined)  # e-mail
        self.assertIn("+420111", combined)  # telefon
