"""Coverage for the Notion ingest upsert + blocks extraction (PR #203).

Three surfaces:
  * `_sanitize_blocks` — drops malformed blocks instead of failing the
    whole ingest.
  * `POST /api/events/from-source/` — returns `existing_event` pointer
    when a previous ingest of the same Notion page produced an event.
  * `EventWriteSerializer.external_ref` — round-trips through
    create_event / update_event so the frontend can stamp / preserve
    the idempotency key.

External Notion + Anthropic calls are mocked.
"""
from __future__ import annotations

import json
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.integrations import encrypt_token
from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event
from .notion_ingest import _sanitize_blocks


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


def _make_event(ws: Workspace, **kwargs) -> Event:
    starts = kwargs.pop("starts_at", timezone.now() + timedelta(days=30))
    return Event.objects.create(
        workspace=ws,
        slug=kwargs.pop("slug", "ev"),
        title=kwargs.pop("title", "Event"),
        starts_at=starts,
        ends_at=kwargs.pop("ends_at", starts + timedelta(hours=4)),
        status=Event.STATUS_DRAFT,
        **kwargs,
    )


class SanitizeBlocksTests(TestCase):
    """Defensive filter — Claude returns nonsense once in a while; we
    keep what's salvageable instead of throwing the whole draft away."""

    def test_drops_unknown_block_type(self) -> None:
        out = _sanitize_blocks(
            [
                {"id": "hero", "type": "hero", "payload": {"eyebrow": ""}},
                {"id": "garbage", "type": "definitely-not-real", "payload": {}},
            ]
        )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["type"], "hero")

    def test_drops_missing_payload(self) -> None:
        out = _sanitize_blocks(
            [{"id": "hero", "type": "hero"}]  # no payload
        )
        self.assertEqual(out, [])

    def test_drops_duplicate_id(self) -> None:
        out = _sanitize_blocks(
            [
                {"id": "hero", "type": "hero", "payload": {}},
                {"id": "hero", "type": "prose", "payload": {}},
            ]
        )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["type"], "hero")

    def test_empty_id_dropped(self) -> None:
        out = _sanitize_blocks(
            [{"id": "", "type": "hero", "payload": {}}]
        )
        self.assertEqual(out, [])

    def test_non_list_returns_empty(self) -> None:
        self.assertEqual(_sanitize_blocks(None), [])
        self.assertEqual(_sanitize_blocks("not a list"), [])
        self.assertEqual(_sanitize_blocks({}), [])


class IngestExistingEventDetectionTests(TestCase):
    """End-to-end ingest path: when the user re-ingests the same Notion
    page in a workspace they own, the response carries an
    `existing_event` pointer the frontend renders as "Aktualizovat
    existující" toggle."""

    NOTION_PAGE_ID = "3868fcec798581b782b5fb278cdc95d7"
    NOTION_URL = (
        f"https://app.notion.com/p/olaf/Letni-kemp-{NOTION_PAGE_ID}"
        "?v=somecollection"
    )

    def setUp(self) -> None:
        self.url = "/api/events/from-source/"
        self.user = _make_user("alice@upsert.test")
        self.user.notion_integration_token_encrypted = encrypt_token(
            "secret_" + "x" * 50
        )
        self.user.anthropic_api_key_encrypted = encrypt_token(
            "sk-ant-" + "y" * 50
        )
        self.user.save()
        self.ws = _make_workspace(self.user, slug="upsert-ws")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _mock_apis(self, *, title: str = "Letní kemp 2026"):
        """Patch urlopen so Notion + Anthropic calls return canned data
        — matches the pattern in tests_notion_ingest.py."""
        notion_resp = {
            "results": [
                {
                    "type": "heading_1",
                    "heading_1": {"rich_text": [{"plain_text": title}]},
                    "has_children": False,
                }
            ],
            "next_cursor": None,
        }
        anthropic_resp = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "title": title,
                            "description": "Test camp",
                            "starts_at": "2026-08-13T14:00:00+02:00",
                            "ends_at": "2026-08-16T15:00:00+02:00",
                            "location_text": "Beskydy",
                            "capacity": 8,
                            "price_amount": "4490",
                            "price_currency": "CZK",
                            "price_note": None,
                            "notes": [],
                            "blocks": [
                                {
                                    "id": "hero",
                                    "type": "hero",
                                    "payload": {
                                        "eyebrow": "BĚŽECKÝ KEMP",
                                        "subtitle": "Tři dny v Beskydech",
                                    },
                                }
                            ],
                        }
                    ),
                }
            ]
        }
        payloads = [
            json.dumps(notion_resp).encode("utf-8"),
            json.dumps(anthropic_resp).encode("utf-8"),
        ]
        mock_responses = []
        for payload in payloads:
            mock = type(
                "Resp",
                (),
                {
                    "read": lambda self, p=payload: p,
                    "__enter__": lambda self: self,
                    "__exit__": lambda self, *args: None,
                },
            )()
            mock_responses.append(mock)
        return mock_responses

    def test_no_match_returns_existing_null(self) -> None:
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis()
            resp = self.client.post(
                self.url, {"url": self.NOTION_URL}, format="json"
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertIsNone(body["existing_event"])
        self.assertEqual(body["notion_page_id"], self.NOTION_PAGE_ID)
        # Blocks survive ingest.
        self.assertEqual(len(body["blocks"]), 1)
        self.assertEqual(body["blocks"][0]["type"], "hero")

    def test_match_returns_existing_event(self) -> None:
        """An event with `external_ref = notion:<page_id>` is found and
        returned as the upsert target."""
        existing = _make_event(
            self.ws,
            slug="my-kemp",
            title="My Camp Draft",
            external_ref=f"notion:{self.NOTION_PAGE_ID}",
        )
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis()
            resp = self.client.post(
                self.url, {"url": self.NOTION_URL}, format="json"
            )
        body = resp.json()
        self.assertEqual(body["existing_event"]["id"], existing.id)
        self.assertEqual(body["existing_event"]["slug"], "my-kemp")
        self.assertEqual(body["existing_event"]["title"], "My Camp Draft")
        self.assertEqual(body["existing_event"]["workspace_slug"], "upsert-ws")

    def test_match_only_in_owned_workspaces(self) -> None:
        """Event with the same external_ref in a workspace the caller is
        NOT an owner/admin of is NOT returned — privacy gate."""
        other_owner = _make_user("bob@upsert.test")
        other_ws = _make_workspace(other_owner, slug="other-ws")
        _make_event(
            other_ws,
            slug="someone-elses",
            title="Bobs Camp",
            external_ref=f"notion:{self.NOTION_PAGE_ID}",
        )
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis()
            resp = self.client.post(
                self.url, {"url": self.NOTION_URL}, format="json"
            )
        # alice doesn't own other-ws → must not see Bobs event.
        self.assertIsNone(resp.json()["existing_event"])


class ExternalRefSerializerTests(TestCase):
    """external_ref round-trips through create_event so the frontend
    can stamp `notion:<page_id>` on a fresh draft."""

    def setUp(self) -> None:
        self.user = _make_user("c@ref.test")
        self.ws = _make_workspace(self.user, slug="ref-ws")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_event_persists_external_ref(self) -> None:
        starts = (timezone.now() + timedelta(days=10)).isoformat()
        ends = (timezone.now() + timedelta(days=10, hours=4)).isoformat()
        payload = {
            "slug": "kemp",
            "title": "Kemp",
            "starts_at": starts,
            "ends_at": ends,
            "tz": "Europe/Prague",
            "external_ref": "notion:abcdef0123456789abcdef0123456789",
        }
        r = self.client.post(
            reverse("events:create", kwargs={"workspace_slug": self.ws.slug}),
            payload,
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        event = Event.objects.get(slug="kemp", workspace=self.ws)
        self.assertEqual(
            event.external_ref,
            "notion:abcdef0123456789abcdef0123456789",
        )

    def test_external_ref_too_long_is_400(self) -> None:
        starts = (timezone.now() + timedelta(days=10)).isoformat()
        ends = (timezone.now() + timedelta(days=10, hours=4)).isoformat()
        payload = {
            "slug": "kemp2",
            "title": "Kemp 2",
            "starts_at": starts,
            "ends_at": ends,
            "tz": "Europe/Prague",
            "external_ref": "x" * 200,  # > 120 cap
        }
        r = self.client.post(
            reverse("events:create", kwargs={"workspace_slug": self.ws.slug}),
            payload,
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("external_ref", r.json())
