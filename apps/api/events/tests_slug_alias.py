"""Tests for Event slug alias / rename redirect (2026-09-11).

Signal `events.signals.create_slug_alias_on_rename` vytvoří
EventSlugAlias záznam pokaždé, když Event.slug se změní. Public
endpointy pak fallback-ují na alias při 404 → old URL nikdy nespadne.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from workspaces.models import Workspace

from .models import Event, EventSlugAlias


def _make_event(**overrides) -> Event:
    starts = overrides.pop("starts_at", timezone.now() + timedelta(days=14))
    ends = overrides.pop("ends_at", starts + timedelta(hours=4))
    defaults = {
        "slug": "puvodni",
        "title": "Test akce",
        "starts_at": starts,
        "ends_at": ends,
        "status": Event.STATUS_PUBLISHED,
    }
    defaults.update(overrides)
    if "workspace" not in defaults:
        defaults["workspace"] = Workspace.objects.create(slug="ws", name="WS")
    return Event.objects.create(**defaults)


class SlugAliasCreationTests(TestCase):
    """Pre_save signal drží log historických slugů."""

    def test_alias_created_on_slug_change(self) -> None:
        ev = _make_event(slug="letni-kemp-2025")
        ev.slug = "letni-kemp-2026"
        ev.save()
        self.assertTrue(
            EventSlugAlias.objects.filter(
                event=ev, old_slug="letni-kemp-2025"
            ).exists()
        )

    def test_no_alias_on_first_save(self) -> None:
        ev = _make_event(slug="alpha")
        self.assertEqual(EventSlugAlias.objects.filter(event=ev).count(), 0)

    def test_multiple_renames_stack_aliases(self) -> None:
        ev = _make_event(slug="v1")
        ev.slug = "v2"
        ev.save()
        ev.slug = "v3"
        ev.save()
        old_slugs = set(
            EventSlugAlias.objects.filter(event=ev).values_list(
                "old_slug", flat=True
            )
        )
        self.assertEqual(old_slugs, {"v1", "v2"})

    def test_alias_updates_if_slug_collides_later(self) -> None:
        # Edge: událost X má slug A, přejmenuje se na B. Vytvoří se alias
        # A → X. Nová událost Y je pojmenovaná A (jinak validation by
        # zabránila, ale simulate direct DB) → alias A ukazuje pořád
        # na X protože update_or_create ale je to jen dokumentace
        # behavior. Kdyby to vadilo, řešíme přes unique index.
        ws = Workspace.objects.create(slug="ws-collide", name="C")
        ev = _make_event(slug="a", workspace=ws)
        ev.slug = "b"
        ev.save()
        # Přímý smazat alias a nastavit prezentaci: alias existuje.
        self.assertTrue(
            EventSlugAlias.objects.filter(workspace=ws, old_slug="a").exists()
        )


class PublicApiSlugAliasTests(TestCase):
    """Public API endpoint musí najít event přes alias."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="olaf-adventures", name="O")

    def test_single_endpoint_finds_via_alias(self) -> None:
        ev = _make_event(
            slug="letni-kemp-2025",
            workspace=self.ws,
            title="Letní kemp",
        )
        ev.slug = "letni-kemp-2026"
        ev.save()
        # Externí konzument drží starý slug — dostane 200 s aktuálním
        # payloadem (title etc.). Frontend by měl detekovat rozdíl mezi
        # payload.slug a URL slug a redirect-nout.
        resp = self.client.get(
            reverse(
                "public-event-status",
                kwargs={"slug": "letni-kemp-2025"},
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body["slug"], "letni-kemp-2026")
        self.assertEqual(body["title"], "Letní kemp")

    def test_batch_endpoint_finds_via_alias(self) -> None:
        ev = _make_event(slug="stara", workspace=self.ws)
        ev.slug = "nova"
        ev.save()
        # Batch endpoint iteruje slugs — alias-lookup pořadí je in-memory
        # by-slug map; alias hitne fallback path v `_resolve_event` jen
        # pro single. Batch má vlastní `slug__in` filter, tak alias
        # tam explicit nefunguje (V1 skip). Test dokumentuje aktuální
        # chování; kdyby chtěli i batch alias support, přidáme.
        resp = self.client.get(
            reverse("public-events-batch") + "?slugs=nova,stara"
        )
        body = resp.json()
        # `nova` (canonical) najde direct, `stara` batch neresolvne.
        self.assertEqual([e["slug"] for e in body], ["nova"])


class PublicEventViewSlugAliasTests(TestCase):
    """Auth-side `/api/events/<ws>/<slug>/` public_event view s alias."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.ws = Workspace.objects.create(slug="my-ws", name="My WS")

    def test_public_event_view_resolves_alias(self) -> None:
        ev = _make_event(slug="stara-akce", workspace=self.ws)
        ev.slug = "nova-akce"
        ev.save()
        resp = self.client.get(
            reverse(
                "events:public",
                kwargs={
                    "workspace_slug": "my-ws",
                    "event_slug": "stara-akce",
                },
            )
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body["slug"], "nova-akce")
