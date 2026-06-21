"""Coverage for the event import endpoint + the APIToken bearer auth.

Two surfaces:
  * `POST /api/events/<ws>/import/` — JSON upsert from an external
    source (e.g. the mountain-guide Claude Code skill).
  * Token issue/list/revoke via `/api/auth/me/api-tokens/`.

The schema endpoint is exercised here too — it's tiny but worth
locking the contract (block-type enum, required event fields).
"""
from __future__ import annotations

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import APIToken, User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event


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


def _make_payload(**overrides) -> dict:
    starts = (timezone.now() + timedelta(days=30)).isoformat()
    ends = (timezone.now() + timedelta(days=33)).isoformat()
    payload = {
        "slug": "beskydy-spring-camp",
        "title": "Beskydy Spring Camp",
        "description": "Tri dny na hrebenech Beskyd.",
        "starts_at": starts,
        "ends_at": ends,
        "tz": "Europe/Prague",
        "location_text": "Pustevny",
        "capacity": 24,
        "blocks": [
            {
                "id": "hero",
                "type": "hero",
                "payload": {
                    "cover_url": "https://example.com/cover.jpg",
                    "eyebrow": "Beskydy · 2026",
                    "title_override": "Beskydy Spring Camp",
                    "subtitle": "Tri dny, dve noci na chate.",
                    "cta_label": "Chci jet",
                    "cta_href": "#prihlaska",
                    "meta": [{"k": "Délka", "v": "3 dny"}],
                },
            },
            {
                "id": "faq",
                "type": "faq",
                "payload": {
                    "eyebrow": "FAQ",
                    "title": "Casto kladene dotazy",
                    "items": [
                        {"question": "Co s sebou?", "answer": "Spacák a boty."}
                    ],
                },
            },
        ],
    }
    payload.update(overrides)
    return payload


class ImportEndpointAuthTests(TestCase):
    """Permission + auth gate for the import endpoint."""

    def setUp(self) -> None:
        self.owner = _make_user("owner@imp.com")
        self.outsider = _make_user("out@imp.com")
        self.ws = _make_workspace(self.owner, slug="impws")
        self.url = reverse(
            "events:import", kwargs={"workspace_slug": self.ws.slug}
        )
        self.client = APIClient()

    def test_anonymous_is_blocked(self) -> None:
        r = self.client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 401)

    def test_non_owner_is_403(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 403)

    def test_unknown_workspace_is_404(self) -> None:
        self.client.force_authenticate(self.owner)
        url = reverse(
            "events:import", kwargs={"workspace_slug": "nope"}
        )
        r = self.client.post(url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 404)

    def test_session_owner_can_create(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()["created"])
        self.assertEqual(r.json()["status"], Event.STATUS_DRAFT)

    def test_bearer_token_authenticates(self) -> None:
        """Real-world path: the mountain-guide skill curls with
        Authorization: Bearer <token>. Session is irrelevant — token
        alone gets you in."""
        token = APIToken.objects.create(user=self.owner, label="mtn-guide")
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.key}")
        r = client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        # last_used_at gets stamped.
        token.refresh_from_db()
        self.assertIsNotNone(token.last_used_at)

    def test_revoked_token_is_401(self) -> None:
        token = APIToken.objects.create(user=self.owner, label="dead")
        token.revoke()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.key}")
        r = client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 401)

    def test_invalid_token_is_401(self) -> None:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        r = client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r.status_code, 401)


class ImportEndpointSemanticsTests(TestCase):
    """Idempotency, draft enforcement, block validation, slug clash."""

    def setUp(self) -> None:
        self.owner = _make_user("o@sem.com")
        self.ws = _make_workspace(self.owner, slug="semws")
        self.url = reverse(
            "events:import", kwargs={"workspace_slug": self.ws.slug}
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_forces_draft_status(self) -> None:
        """Caller cannot publish through the importer. The endpoint
        always lands as draft so a misconfigured skript can't push a
        half-baked event live."""
        r = self.client.post(
            self.url,
            _make_payload(status="published"),
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        event = Event.objects.get(pk=r.json()["event_id"])
        self.assertEqual(event.status, Event.STATUS_DRAFT)

    def test_idempotent_on_external_ref(self) -> None:
        """Re-import with the same external_ref updates the same row."""
        payload = _make_payload(external_ref="beskydy-2026")
        r1 = self.client.post(self.url, payload, format="json")
        self.assertEqual(r1.status_code, 201, r1.content)
        first_id = r1.json()["event_id"]
        self.assertTrue(r1.json()["created"])

        # Re-import with updated title.
        payload2 = _make_payload(
            external_ref="beskydy-2026",
            title="Beskydy Spring Camp 2026 (updated)",
        )
        r2 = self.client.post(self.url, payload2, format="json")
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertFalse(r2.json()["created"])
        self.assertEqual(r2.json()["event_id"], first_id)

        event = Event.objects.get(pk=first_id)
        self.assertEqual(event.title, "Beskydy Spring Camp 2026 (updated)")
        self.assertEqual(event.external_ref, "beskydy-2026")
        # Exactly one row — no duplicate.
        self.assertEqual(
            Event.objects.filter(workspace=self.ws).count(), 1
        )

    def test_no_external_ref_always_creates(self) -> None:
        """Without an idempotency key, repeated POSTs are independent.
        Caller has to use distinct slugs to avoid 400."""
        r1 = self.client.post(
            self.url, _make_payload(slug="a-camp"), format="json"
        )
        self.assertEqual(r1.status_code, 201)
        r2 = self.client.post(
            self.url, _make_payload(slug="b-camp"), format="json"
        )
        self.assertEqual(r2.status_code, 201)
        self.assertNotEqual(
            r1.json()["event_id"], r2.json()["event_id"]
        )

    def test_slug_collision_on_create_is_400(self) -> None:
        r1 = self.client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r1.status_code, 201)
        # Same slug, no external_ref → collision.
        r2 = self.client.post(self.url, _make_payload(), format="json")
        self.assertEqual(r2.status_code, 400)
        self.assertIn("slug", r2.json())

    def test_invalid_block_payload_is_400(self) -> None:
        """Unknown block type or missing required field bubbles up
        from the existing blocks.py validators."""
        bad = _make_payload()
        bad["blocks"] = [
            {"id": "bad", "type": "definitely-not-a-real-type", "payload": {}}
        ]
        r = self.client.post(self.url, bad, format="json")
        self.assertEqual(r.status_code, 400)

    def test_response_includes_edit_and_public_urls(self) -> None:
        r = self.client.post(self.url, _make_payload(), format="json")
        body = r.json()
        self.assertIn("/admin/events/beskydy-spring-camp/edit", body["edit_url"])
        self.assertIn(
            f"/{self.ws.slug}/e/beskydy-spring-camp", body["public_url"]
        )

    def test_external_ref_scoped_per_workspace(self) -> None:
        """Two workspaces can have the same external_ref — the unique
        constraint is per (workspace, ref)."""
        other_owner = _make_user("o2@sem.com")
        other_ws = _make_workspace(other_owner, slug="other")

        payload = _make_payload(external_ref="shared-ref")
        r1 = self.client.post(self.url, payload, format="json")
        self.assertEqual(r1.status_code, 201)

        # Same ref under a different workspace, different owner.
        client2 = APIClient()
        client2.force_authenticate(other_owner)
        url2 = reverse(
            "events:import", kwargs={"workspace_slug": other_ws.slug}
        )
        r2 = client2.post(url2, payload, format="json")
        self.assertEqual(r2.status_code, 201, r2.content)
        self.assertNotEqual(
            r1.json()["event_id"], r2.json()["event_id"]
        )


class ImportSchemaEndpointTests(TestCase):
    """The schema endpoint is anonymous + read-only — locks the
    public contract for external clients."""

    def test_returns_schema_anonymously(self) -> None:
        client = APIClient()
        r = client.get(reverse("events:import-schema"))
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("properties", body)
        self.assertIn("blocks", body["properties"])
        # The block-type enum must include all 10 registered types.
        types = body["properties"]["blocks"]["items"]["properties"]["type"]["enum"]
        for expected in (
            "hero", "prose", "stats", "days", "included_split",
            "gallery", "map", "faq", "practical", "gear",
        ):
            self.assertIn(expected, types)


class APITokenManagementTests(TestCase):
    """Issue / list / revoke flow for the personal access tokens."""

    def setUp(self) -> None:
        self.user = _make_user("u@tok.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_returns_plaintext_once(self) -> None:
        r = self.client.post(
            reverse("accounts:api-tokens"),
            {"label": "mountain-guide laptop"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertIn("key", body)
        self.assertEqual(body["label"], "mountain-guide laptop")
        self.assertTrue(body["is_active"])

        # List view: plaintext key MUST NOT come back.
        r2 = self.client.get(reverse("accounts:api-tokens"))
        self.assertEqual(r2.status_code, 200)
        items = r2.json()
        self.assertEqual(len(items), 1)
        self.assertNotIn("key", items[0])
        self.assertEqual(items[0]["prefix"], body["key"][:8])

    def test_revoke_stops_token_from_authenticating(self) -> None:
        token = APIToken.objects.create(user=self.user, label="temp")
        url = reverse(
            "accounts:api-token-detail", kwargs={"token_id": token.id}
        )
        r = self.client.delete(url)
        self.assertEqual(r.status_code, 204)

        # Now the token can't authenticate against anything.
        token.refresh_from_db()
        self.assertIsNotNone(token.revoked_at)

    def test_label_is_required(self) -> None:
        r = self.client.post(
            reverse("accounts:api-tokens"), {"label": ""}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_users_cannot_revoke_other_users_tokens(self) -> None:
        other = _make_user("other@tok.com")
        other_token = APIToken.objects.create(user=other, label="x")
        url = reverse(
            "accounts:api-token-detail",
            kwargs={"token_id": other_token.id},
        )
        r = self.client.delete(url)
        # 404 — never confirm existence of someone else's resource.
        self.assertEqual(r.status_code, 404)
        other_token.refresh_from_db()
        self.assertIsNone(other_token.revoked_at)
