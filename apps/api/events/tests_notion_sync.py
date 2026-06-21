"""Coverage for POST /api/events/<ws>/<slug>/sync-from-source/ and the
properties-fetch helper that surfaces Notion database columns.
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
from .notion_ingest import _property_to_lines


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
        title=kwargs.pop("title", "Old title"),
        starts_at=starts,
        ends_at=kwargs.pop("ends_at", starts + timedelta(hours=4)),
        status=Event.STATUS_DRAFT,
        **kwargs,
    )


class PropertyToLinesTests(TestCase):
    """Database column types most organisers actually use."""

    def test_title_property(self) -> None:
        prop = {
            "type": "title",
            "title": [{"plain_text": "Letní kemp 2026"}],
        }
        self.assertEqual(
            _property_to_lines("Name", prop), ["# Letní kemp 2026"]
        )

    def test_date_range(self) -> None:
        prop = {
            "type": "date",
            "date": {"start": "2026-08-13", "end": "2026-08-16"},
        }
        self.assertEqual(
            _property_to_lines("Datum", prop),
            ["Datum: 2026-08-13 – 2026-08-16"],  # noqa: RUF001
        )

    def test_date_single(self) -> None:
        prop = {"type": "date", "date": {"start": "2026-08-13", "end": None}}
        self.assertEqual(
            _property_to_lines("Datum", prop), ["Datum: 2026-08-13"]
        )

    def test_number(self) -> None:
        prop = {"type": "number", "number": 4490}
        self.assertEqual(
            _property_to_lines("Cena", prop), ["Cena: 4490"]
        )

    def test_multi_select(self) -> None:
        prop = {
            "type": "multi_select",
            "multi_select": [{"name": "kemp"}, {"name": "běh"}],
        }
        self.assertEqual(
            _property_to_lines("Tags", prop), ["Tags: kemp, běh"]
        )

    def test_rich_text(self) -> None:
        prop = {
            "type": "rich_text",
            "rich_text": [{"plain_text": "Bohatá akce v"}, {"plain_text": " Beskydech"}],
        }
        self.assertEqual(
            _property_to_lines("Popis", prop),
            ["Popis: Bohatá akce v Beskydech"],
        )

    def test_empty_value_skipped(self) -> None:
        # Most "empty" Notion properties send back {"type": ..., "<type>": null}.
        self.assertEqual(
            _property_to_lines("X", {"type": "rich_text", "rich_text": []}),
            [],
        )
        self.assertEqual(
            _property_to_lines("X", {"type": "number", "number": None}),
            [],
        )

    def test_unknown_type_skipped(self) -> None:
        # Relations / rollups / formulas — too noisy for V1.
        prop = {"type": "relation", "relation": [{"id": "abc"}]}
        self.assertEqual(_property_to_lines("Linked", prop), [])


class SyncEndpointTests(TestCase):
    """Owner clicks 'Aktualizovat z Notion' — backend re-ingests via
    the stored page_id and PATCHes the event."""

    NOTION_PAGE_ID = "3868fcec798581b782b5fb278cdc95d7"

    def setUp(self) -> None:
        self.user = _make_user("o@sync.test")
        self.user.notion_integration_token_encrypted = encrypt_token(
            "secret_" + "x" * 50
        )
        self.user.anthropic_api_key_encrypted = encrypt_token(
            "sk-ant-" + "y" * 50
        )
        self.user.save()
        self.ws = _make_workspace(self.user, slug="sync-ws")
        self.event = _make_event(
            self.ws,
            slug="my-kemp",
            title="Old title",
            external_ref=f"notion:{self.NOTION_PAGE_ID}",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse(
            "events:sync-from-source",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def _mock_apis(self, *, draft: dict):
        page_resp = {
            "properties": {
                "Name": {
                    "type": "title",
                    "title": [{"plain_text": "From-Notion title"}],
                }
            }
        }
        children_resp = {"results": [], "next_cursor": None}
        anthropic_resp = {
            "content": [{"type": "text", "text": json.dumps(draft)}]
        }
        payloads = [
            json.dumps(page_resp).encode(),       # GET /pages/<id>
            json.dumps(children_resp).encode(),   # GET /blocks/<id>/children
            json.dumps(anthropic_resp).encode(),  # POST /v1/messages
        ]
        return [
            type(
                "Resp",
                (),
                {
                    "read": lambda self, p=p: p,
                    "__enter__": lambda self: self,
                    "__exit__": lambda self, *args: None,
                },
            )()
            for p in payloads
        ]

    def test_updates_title_and_capacity(self) -> None:
        draft = {
            "title": "Nový titul z Notion",
            "capacity": 16,
            "blocks": [
                {
                    "id": "hero",
                    "type": "hero",
                    "payload": {"eyebrow": "NEW"},
                }
            ],
        }
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis(draft=draft)
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200, r.content)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, "Nový titul z Notion")
        self.assertEqual(self.event.capacity, 16)
        self.assertEqual(len(self.event.blocks), 1)
        # Slug + status are pinned — sync must never break public URL
        # or silently publish an event.
        self.assertEqual(self.event.slug, "my-kemp")
        self.assertEqual(self.event.status, Event.STATUS_DRAFT)

    def test_keeps_blocks_when_claude_returns_empty(self) -> None:
        """Defensive: if Claude says blocks=[] but we already have a
        hand-built landing, don't blank it out. Sync only enriches."""
        self.event.blocks = [
            {"id": "hero", "type": "hero", "payload": {"eyebrow": "EXISTING"}}
        ]
        self.event.save(update_fields=["blocks"])
        draft = {"title": "Updated", "blocks": []}
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis(draft=draft)
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.blocks[0]["payload"]["eyebrow"], "EXISTING")

    def test_no_external_ref_returns_400(self) -> None:
        event = _make_event(self.ws, slug="bare", external_ref="")
        url = reverse(
            "events:sync-from-source",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": event.slug,
            },
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 400)

    def test_non_owner_403(self) -> None:
        outsider = _make_user("outsider@sync.test")
        client = APIClient()
        client.force_authenticate(outsider)
        r = client.post(self.url)
        self.assertEqual(r.status_code, 403)

    def test_missing_notion_token_returns_400(self) -> None:
        self.user.notion_integration_token_encrypted = ""
        self.user.save()
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json().get("missing"), "notion")

    def test_unknown_event_404(self) -> None:
        url = reverse(
            "events:sync-from-source",
            kwargs={"workspace_slug": self.ws.slug, "event_slug": "nope"},
        )
        r = self.client.post(url)
        self.assertEqual(r.status_code, 404)

    def test_missing_anthropic_token_returns_400(self) -> None:
        self.user.anthropic_api_key_encrypted = ""
        self.user.save()
        r = self.client.post(self.url)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json().get("missing"), "anthropic")

    def test_notion_page_deleted_returns_400(self) -> None:
        """User smazal stránku v Notionu mezi prvním ingestem a syncem.
        Notion API vrátí 404; náš handler ho přemapuje na 400 s českou
        radou (page invisible to integration / smazaná)."""
        import urllib.error

        def boom(*args, **kwargs):
            raise urllib.error.HTTPError(
                "https://api.notion.com/v1/pages/abc",
                404,
                "Not Found",
                {},
                None,
            )

        with patch(
            "events.notion_ingest.urllib.request.urlopen", side_effect=boom
        ):
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 400)
        # Helpful copy o Connections nastavení.
        self.assertIn("Connections", r.json().get("detail", ""))

    def test_anthropic_garbage_response_returns_502(self) -> None:
        """Claude vrátí non-JSON text — ingest mapuje na 502 (transient
        upstream failure), ne 500 (interní bug)."""
        # Aspoň 1 char v properties, jinak ingest brečí "prázdná
        # stránka" před Anthropic voláním.
        page_resp = {
            "properties": {
                "Name": {
                    "type": "title",
                    "title": [{"plain_text": "Letní kemp"}],
                }
            }
        }
        children_resp = {"results": [], "next_cursor": None}
        anthropic_resp = {
            "content": [{"type": "text", "text": "definitely not json"}]
        }
        payloads = [
            json.dumps(page_resp).encode(),
            json.dumps(children_resp).encode(),
            json.dumps(anthropic_resp).encode(),
        ]
        mocks = [
            type(
                "Resp",
                (),
                {
                    "read": lambda self, p=p: p,
                    "__enter__": lambda self: self,
                    "__exit__": lambda self, *args: None,
                },
            )()
            for p in payloads
        ]
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = mocks
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 502, r.content)

    def test_partial_response_preserves_untouched_fields(self) -> None:
        """Claude vrátí jen title — všechno ostatní (capacity, price,
        location) zůstává jak bylo. fields_updated obsahuje právě 1
        položku."""
        self.event.capacity = 12
        self.event.location_text = "Beskydy"
        self.event.save(update_fields=["capacity", "location_text"])
        draft = {"title": "Pouze title se změnil"}
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis(draft=draft)
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, "Pouze title se změnil")
        self.assertEqual(self.event.capacity, 12)
        self.assertEqual(self.event.location_text, "Beskydy")
        body = r.json()
        self.assertEqual(body["fields_updated"], ["title"])

    def test_unknown_block_type_dropped_by_sanitizer(self) -> None:
        """Claude občas vyhalucinuje block type — sanitizer ho dropne
        v _sanitize_blocks. Sync nešílí, ostatní bloky projdou."""
        draft = {
            "title": "Updated",
            "blocks": [
                {
                    "id": "hero",
                    "type": "hero",
                    "payload": {"eyebrow": "OK"},
                },
                {
                    "id": "weird",
                    "type": "definitely-not-real",
                    "payload": {},
                },
                {
                    "id": "prose-1",
                    "type": "prose",
                    "payload": {"heading": "Real prose", "body": "Hi"},
                },
            ],
        }
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis(draft=draft)
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200, r.content)
        self.event.refresh_from_db()
        # Sanitizer drops the bogus one; 2 valid blocks persist.
        types = [b["type"] for b in self.event.blocks]
        self.assertEqual(types, ["hero", "prose"])

    def test_event_status_pinned_through_sync(self) -> None:
        """Sync nesmí změnit status. Pokud Claude vrátí "status":
        "published", sync ten field ignoruje (není v extractable
        tuple) → event zůstává draft. Bezpečnostní invariant."""
        # Sanity: před syncem je draft (z fixture).
        self.assertEqual(self.event.status, Event.STATUS_DRAFT)
        draft = {
            "title": "Should still be draft after sync",
            "status": "published",  # NEEXTRACTUJE se — view to ignoruje
        }
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.side_effect = self._mock_apis(draft=draft)
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, Event.STATUS_DRAFT)
