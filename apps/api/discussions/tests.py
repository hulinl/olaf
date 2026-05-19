"""Smoke tests for the discussion wall — permissions + happy paths."""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember


def _make_event(workspace, **overrides):
    starts = timezone.now() + timedelta(days=14)
    defaults = {
        "slug": "test-event",
        "title": "Test event",
        "starts_at": starts,
        "ends_at": starts + timedelta(hours=4),
        "status": Event.STATUS_PUBLISHED,
    }
    defaults.update(overrides)
    return Event.objects.create(workspace=workspace, **defaults)


class WorkspaceWallTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Wner",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.outsider = User.objects.create_user(
            email="out@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Ut",
            email_verified=True,
        )

    def test_outsider_cannot_read(self):
        self.client.force_authenticate(self.outsider)
        url = reverse("discussions:workspace-topics", kwargs={"slug": "olaf"})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_owner_creates_and_lists_topic(self):
        self.client.force_authenticate(self.owner)
        url = reverse("discussions:workspace-topics", kwargs={"slug": "olaf"})
        resp = self.client.post(
            url, {"title": "Vítejte!", "body": "Ahoj členové", "pinned": True}
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_201_CREATED)
        self.assertTrue(resp.json()["pinned"])

        list_resp = self.client.get(url)
        self.assertEqual(len(list_resp.json()), 1)


class EventWallTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf", name="Olaf")
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Wner",
            email_verified=True,
        )
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.owner, role=WorkspaceMember.ROLE_OWNER
        )
        self.event = _make_event(self.ws)
        self.participant = User.objects.create_user(
            email="p@example.com",
            password="pass-abcdef-1234",
            first_name="P",
            last_name="One",
            email_verified=True,
        )
        RSVP.objects.create(
            event=self.event, user=self.participant, status=RSVP.STATUS_YES
        )
        self.stranger = User.objects.create_user(
            email="s@example.com",
            password="pass-abcdef-1234",
            first_name="S",
            last_name="Tranger",
            email_verified=True,
        )

    def test_stranger_blocked(self):
        self.client.force_authenticate(self.stranger)
        url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_participant_creates_topic_and_comment(self):
        self.client.force_authenticate(self.participant)
        topics_url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        resp = self.client.post(topics_url, {"title": "Sraz v 9?", "body": ""})
        self.assertEqual(resp.status_code, drf_status.HTTP_201_CREATED)
        topic_id = resp.json()["id"]

        comments_url = reverse(
            "discussions:event-topic-comments",
            kwargs={
                "workspace_slug": "olaf",
                "event_slug": "test-event",
                "topic_id": topic_id,
            },
        )
        comment = self.client.post(comments_url, {"body": "Souhlas"})
        self.assertEqual(comment.status_code, drf_status.HTTP_201_CREATED)

        detail = self.client.get(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            )
        )
        self.assertEqual(detail.json()["comment_count"], 1)
        self.assertEqual(len(detail.json()["comments"]), 1)

    def test_owner_can_moderate(self):
        self.client.force_authenticate(self.participant)
        topics_url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        created = self.client.post(topics_url, {"title": "Hi", "body": ""})
        topic_id = created.json()["id"]

        self.client.force_authenticate(self.owner)
        resp = self.client.delete(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            )
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_204_NO_CONTENT)

    def test_locked_topic_rejects_new_comments(self):
        self.client.force_authenticate(self.participant)
        topics_url = reverse(
            "discussions:event-topics",
            kwargs={"workspace_slug": "olaf", "event_slug": "test-event"},
        )
        topic_id = self.client.post(
            topics_url, {"title": "Hi", "body": ""}
        ).json()["id"]

        self.client.force_authenticate(self.owner)
        self.client.patch(
            reverse(
                "discussions:event-topic-detail",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            ),
            {"locked": True},
            format="json",
        )

        self.client.force_authenticate(self.participant)
        resp = self.client.post(
            reverse(
                "discussions:event-topic-comments",
                kwargs={
                    "workspace_slug": "olaf",
                    "event_slug": "test-event",
                    "topic_id": topic_id,
                },
            ),
            {"body": "Late comment"},
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_400_BAD_REQUEST)
