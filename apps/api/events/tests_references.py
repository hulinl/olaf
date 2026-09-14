"""Reference feature tests (2026-09-14).

Pokrývá:
- Owner toggle `is_public` na jednotlivé EventFeedback.
- Landing endpoint vrací `public_references` jen s zveřejněnými.
- Public API `/api/public/events/e/<hash>/references` funguje pro
  externí web (CORS, cache-control, jen public feedback).
- `public_display_name` respektuje `consented_to_publish` flag.
- Feedback formulář uloží consent při submitu.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import RSVP, Event, EventFeedback


class ReferenceModelTests(TestCase):
    def test_public_display_name_with_consent(self) -> None:
        fb = EventFeedback(
            name="Jana Nováková", rating=5, consented_to_publish=True
        )
        self.assertEqual(fb.public_display_name(), "Jana Nováková")

    def test_public_display_name_without_consent_is_shortened(self) -> None:
        fb = EventFeedback(
            name="Jana Nováková", rating=5, consented_to_publish=False
        )
        self.assertEqual(fb.public_display_name(), "Jana N.")

    def test_public_display_name_without_name_is_anon(self) -> None:
        fb = EventFeedback(name="", rating=5)
        self.assertEqual(fb.public_display_name(), "Anonymní účastník")

    def test_single_word_name(self) -> None:
        fb = EventFeedback(name="Kaia", rating=4)
        self.assertEqual(fb.public_display_name(), "Kaia")


class ReferenceOwnerToggleTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o@ex.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ne",
        )
        self.participant = User.objects.create_user(
            email="p@ex.com",
            password="pass-abcdef-1234",
            first_name="Jana",
            last_name="Nováková",
        )
        self.ws = Workspace.objects.create(slug="ws", name="WS")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() - timedelta(days=5)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="past",
            title="Past",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        self.rsvp = RSVP.objects.create(
            event=self.event,
            user=self.participant,
            status=RSVP.STATUS_YES,
        )
        self.fb = EventFeedback.objects.create(
            rsvp=self.rsvp,
            event=self.event,
            email="p@ex.com",
            name="Jana Nováková",
            rating=5,
            went_well="Skvělá akce, chutné jídlo, hodná parta.",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_publish_toggle_flips_flag(self) -> None:
        url = reverse(
            "events:event-feedback-publish",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "feedback_id": self.fb.pk,
            },
        )
        r = self.client.patch(url, {"is_public": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.fb.refresh_from_db()
        self.assertTrue(self.fb.is_public)

    def test_non_owner_gets_404(self) -> None:
        other = User.objects.create_user(
            email="x@ex.com",
            password="pass-abcdef-1234",
            first_name="X",
            last_name="Y",
        )
        self.client.force_authenticate(other)
        url = reverse(
            "events:event-feedback-publish",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "feedback_id": self.fb.pk,
            },
        )
        r = self.client.patch(url, {"is_public": True}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_workspace_references_list(self) -> None:
        self.fb.is_public = True
        self.fb.save(update_fields=["is_public"])
        url = reverse(
            "events:workspace-references",
            kwargs={"workspace_slug": self.ws.slug},
        )
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["rating"], 5)
        self.assertTrue(body[0]["is_public"])


class ReferencePublicApiTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o@ex.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ne",
        )
        self.p = User.objects.create_user(
            email="p@ex.com",
            password="pass-abcdef-1234",
            first_name="Jana",
            last_name="Nováková",
        )
        self.ws = Workspace.objects.create(slug="ws-2", name="WS2")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() - timedelta(days=5)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="past-2",
            title="Past 2",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        self.rsvp = RSVP.objects.create(
            event=self.event, user=self.p, status=RSVP.STATUS_YES
        )
        # 2 feedbacky: jeden public, jeden non-public.
        EventFeedback.objects.create(
            rsvp=self.rsvp,
            event=self.event,
            email="p@ex.com",
            name="Jana Nováková",
            rating=5,
            went_well="Best akce ever.",
            is_public=True,
        )
        other_rsvp = RSVP.objects.create(
            event=self.event,
            user=User.objects.create_user(
                email="x@ex.com",
                password="pass-abcdef-1234",
                first_name="X",
                last_name="Y",
            ),
            status=RSVP.STATUS_YES,
        )
        EventFeedback.objects.create(
            rsvp=other_rsvp,
            event=self.event,
            email="x@ex.com",
            name="X Y",
            rating=3,
            went_well="Bylo to fajn.",
            is_public=False,
        )

    def test_public_references_endpoint_returns_only_public(self) -> None:
        r = self.client.get(
            f"/api/public/events/e/{self.event.public_id}/references"
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Access-Control-Allow-Origin"], "*")
        body = r.json()
        self.assertEqual(body["summary"]["count"], 1)
        self.assertEqual(len(body["references"]), 1)
        self.assertEqual(body["references"][0]["rating"], 5)
        # Bez consent → zkrácené.
        self.assertEqual(
            body["references"][0]["display_name"], "Jana N."
        )

    def test_landing_endpoint_embeds_references(self) -> None:
        r = self.client.get(
            reverse(
                "events:public",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                },
            )
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(len(body["public_references"]), 1)
        self.assertEqual(body["public_references_summary"]["count"], 1)

    def test_average_rating_computed(self) -> None:
        # Zapublish i druhý → ať jsou tam dva ratingy 5 + 3.
        EventFeedback.objects.filter(event=self.event, is_public=False).update(
            is_public=True
        )
        r = self.client.get(
            f"/api/public/events/e/{self.event.public_id}/references"
        )
        body = r.json()
        self.assertEqual(body["summary"]["count"], 2)
        self.assertEqual(body["summary"]["average_rating"], 4.0)


class ReferenceConsentTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            email="o@ex.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ne",
        )
        self.p = User.objects.create_user(
            email="p@ex.com",
            password="pass-abcdef-1234",
            first_name="Petr",
            last_name="Novotný",
        )
        self.ws = Workspace.objects.create(slug="ws-3", name="WS3")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        starts = timezone.now() - timedelta(days=5)
        self.event = Event.objects.create(
            workspace=self.ws,
            slug="past-3",
            title="Past 3",
            starts_at=starts,
            ends_at=starts + timedelta(hours=4),
            status=Event.STATUS_PUBLISHED,
        )
        self.rsvp = RSVP.objects.create(
            event=self.event, user=self.p, status=RSVP.STATUS_YES
        )

    def test_feedback_submit_persists_consent(self) -> None:
        url = reverse(
            "events:feedback-by-token", kwargs={"token": str(self.rsvp.feedback_token)}
        )
        r = self.client.post(
            url,
            {
                "rating": 5,
                "went_well": "Perfektní!",
                "consented_to_publish": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        fb = EventFeedback.objects.get(rsvp=self.rsvp)
        self.assertTrue(fb.consented_to_publish)
