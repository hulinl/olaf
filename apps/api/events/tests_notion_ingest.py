"""Unit tests for the Notion + Anthropic ingest pipeline.

External calls are mocked — we never hit api.notion.com or
api.anthropic.com in tests. The pipeline is otherwise driven exactly
as the production endpoint drives it.
"""
from __future__ import annotations

import json
from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.integrations import encrypt_token
from accounts.models import User

from .notion_ingest import (
    IngestError,
    _block_to_text,
    extract_event_draft,
    extract_notion_page_id,
)


class PageIdExtractionTests(TestCase):
    """The user pastes Notion URLs in many shapes — the extractor
    needs to find the 32-char hex id from each."""

    def test_bare_32_char_id(self) -> None:
        self.assertEqual(
            extract_notion_page_id("abcdef0123456789abcdef0123456789"),
            "abcdef0123456789abcdef0123456789",
        )

    def test_dashed_uuid(self) -> None:
        out = extract_notion_page_id(
            "abcdef01-2345-6789-abcd-ef0123456789"
        )
        self.assertEqual(out, "abcdef0123456789abcdef0123456789")

    def test_long_public_url_with_title_slug(self) -> None:
        url = (
            "https://www.notion.so/myws/Letni-kemp-2026-"
            "abcdef0123456789abcdef0123456789"
        )
        self.assertEqual(
            extract_notion_page_id(url),
            "abcdef0123456789abcdef0123456789",
        )

    def test_garbage_returns_none(self) -> None:
        self.assertIsNone(extract_notion_page_id("https://example.com"))
        self.assertIsNone(extract_notion_page_id(""))
        self.assertIsNone(extract_notion_page_id("nothing useful"))


class BlockToTextTests(TestCase):
    """Each Notion block type has a known textual shape — verify a
    few common ones round-trip into the markdown-ish flat text we
    feed Claude."""

    def _block(self, btype: str, text: str, **extra) -> dict:
        return {
            "type": btype,
            btype: {"rich_text": [{"plain_text": text}], **extra},
        }

    def test_paragraph(self) -> None:
        self.assertEqual(_block_to_text(self._block("paragraph", "hello")), "hello")

    def test_heading_renders_with_hashes(self) -> None:
        self.assertEqual(
            _block_to_text(self._block("heading_1", "Big")),
            "# Big",
        )
        self.assertEqual(
            _block_to_text(self._block("heading_2", "Mid")),
            "## Mid",
        )

    def test_bullet_renders_with_dash(self) -> None:
        self.assertEqual(
            _block_to_text(self._block("bulleted_list_item", "Tea")),
            "- Tea",
        )

    def test_image_block_yields_nothing(self) -> None:
        self.assertEqual(
            _block_to_text({"type": "image", "image": {"file": {"url": "x"}}}),
            "",
        )

    def test_empty_rich_text_yields_nothing(self) -> None:
        self.assertEqual(
            _block_to_text({"type": "paragraph", "paragraph": {"rich_text": []}}),
            "",
        )


class ExtractEventDraftTests(TestCase):
    """Claude call is mocked to return canned JSON. We verify the
    HTTP request shape + the parser's response handling."""

    def test_missing_api_key_raises(self) -> None:
        with self.assertRaises(IngestError) as cm:
            extract_event_draft("text", "")
        self.assertEqual(cm.exception.status_code, 400)

    def test_parses_clean_json_response(self) -> None:
        canned = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {"title": "Letni kemp", "capacity": 12}
                    ),
                }
            ]
        }
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = (
                json.dumps(canned).encode("utf-8")
            )
            out = extract_event_draft("notes", "sk-ant-fake")
        # extract_event_draft normalises `blocks` to an empty list when
        # Claude doesn't return any — sanitizer-driven side effect since
        # PR #203 (Notion ingest + landing blocks).
        self.assertEqual(
            out, {"title": "Letni kemp", "capacity": 12, "blocks": []}
        )

    def test_strips_markdown_code_fence(self) -> None:
        # Models occasionally wrap JSON in ```json ... ``` despite the
        # system prompt; we should tolerate that.
        wrapped = "```json\n" + json.dumps({"title": "X"}) + "\n```"
        canned = {"content": [{"type": "text", "text": wrapped}]}
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = (
                json.dumps(canned).encode("utf-8")
            )
            out = extract_event_draft("notes", "sk-ant-fake")
        self.assertEqual(out["title"], "X")

    def test_invalid_json_raises_502(self) -> None:
        canned = {"content": [{"type": "text", "text": "not even json"}]}
        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = (
                json.dumps(canned).encode("utf-8")
            )
            with self.assertRaises(IngestError) as cm:
                extract_event_draft("notes", "sk-ant-fake")
        self.assertEqual(cm.exception.status_code, 502)


class IngestEndpointTests(TestCase):
    """Integration tests for POST /api/events/from-source/. Notion +
    Anthropic calls are mocked; we check the view's gating + the
    response shape."""

    def setUp(self) -> None:
        self.url = "/api/events/from-source/"
        self.user = User.objects.create_user(
            email="alice@ingest.example.com",
            password="alpine-hike-2026",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _connect_both(self) -> None:
        self.user.notion_integration_token_encrypted = encrypt_token(
            "secret_" + "x" * 50
        )
        self.user.anthropic_api_key_encrypted = encrypt_token(
            "sk-ant-" + "y" * 50
        )
        self.user.save()

    def test_anonymous_blocked(self) -> None:
        resp = APIClient().post(
            self.url, {"url": "any"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_url_400(self) -> None:
        resp = self.client.post(self.url, {"url": ""}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_notion_returns_helpful_400(self) -> None:
        # Only Anthropic configured.
        self.user.anthropic_api_key_encrypted = encrypt_token(
            "sk-ant-" + "y" * 50
        )
        self.user.save()
        resp = self.client.post(
            self.url, {"url": "abcdef0123456789abcdef0123456789"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.json()["missing"], "notion")

    def test_missing_anthropic_returns_helpful_400(self) -> None:
        # Only Notion configured.
        self.user.notion_integration_token_encrypted = encrypt_token(
            "secret_" + "x" * 50
        )
        self.user.save()
        resp = self.client.post(
            self.url, {"url": "abcdef0123456789abcdef0123456789"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.json()["missing"], "anthropic")

    def test_happy_path_returns_draft(self) -> None:
        self._connect_both()

        notion_resp = {
            "results": [
                {
                    "type": "heading_1",
                    "heading_1": {
                        "rich_text": [{"plain_text": "Letní kemp 2026"}]
                    },
                    "has_children": False,
                },
                {
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {
                                "plain_text": (
                                    "16.-19. července 2026 v Beskydech, "
                                    "kapacita 12 lidí."
                                )
                            }
                        ]
                    },
                    "has_children": False,
                },
            ],
            "next_cursor": None,
        }
        anthropic_resp = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "title": "Letní kemp 2026",
                            "description": "Letní kemp v Beskydech",
                            "starts_at": "2026-07-16T09:00:00+02:00",
                            "ends_at": "2026-07-19T16:00:00+02:00",
                            "location_text": "Beskydy",
                            "capacity": 12,
                            "price_amount": None,
                            "price_currency": None,
                            "price_note": None,
                            "notes": [],
                        }
                    ),
                }
            ]
        }

        # Two separate urlopen calls (Notion fetch, then Anthropic).
        # Use side_effect to return them in order.
        notion_payload = json.dumps(notion_resp).encode("utf-8")
        anthropic_payload = json.dumps(anthropic_resp).encode("utf-8")

        with patch("events.notion_ingest.urllib.request.urlopen") as urlopen:
            mock_responses = []
            for payload in [notion_payload, anthropic_payload]:
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
            urlopen.side_effect = mock_responses

            resp = self.client.post(
                self.url,
                {"url": "abcdef0123456789abcdef0123456789"},
                format="json",
            )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body["title"], "Letní kemp 2026")
        self.assertEqual(body["capacity"], 12)
        self.assertEqual(body["source_url"], "abcdef0123456789abcdef0123456789")
