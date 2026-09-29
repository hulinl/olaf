"""Smoke tests pro public race calendar API."""
from __future__ import annotations

from datetime import date, timedelta

from django.test import TestCase
from rest_framework import status as drf_status
from rest_framework.test import APIClient

from accounts.models import User
from races.management.commands.sync_races import _detect_contradiction
from races.models import Race, RaceFavorite, SyncRun
from workspaces.models import Workspace, WorkspaceMember


def _make_user(email: str, first_name: str = "", last_name: str = "") -> User:
    """Utility — vyrobí verified usera s auto profile_slug pro test."""
    return User.objects.create_user(
        email=email,
        password="pass-abcdef-1234",
        first_name=first_name or email.split("@")[0].capitalize(),
        last_name=last_name or "X",
        email_verified=True,
    )


def _make_workspace(slug: str, name: str, owner: User) -> Workspace:
    ws = Workspace.objects.create(name=name, slug=slug)
    WorkspaceMember.objects.create(
        workspace=ws,
        user=owner,
        role=WorkspaceMember.ROLE_OWNER,
        status=WorkspaceMember.STATUS_ACTIVE,
    )
    return ws


def _add_member(
    ws: Workspace, user: User, status: str = WorkspaceMember.STATUS_ACTIVE
) -> WorkspaceMember:
    return WorkspaceMember.objects.create(
        workspace=ws,
        user=user,
        role=WorkspaceMember.ROLE_MEMBER,
        status=status,
    )


def _make_race(**overrides) -> Race:
    defaults = {
        "name": "Test Race",
        "date_start": date.today() + timedelta(days=30),
        "distance_km": 50,
        "country": "Česko",
        "location": "Beskydy",
    }
    defaults.update(overrides)
    return Race.objects.create(**defaults)


class RaceListTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        # Migration 0003 seed dataset se aplikuje i na test DB — pro
        # čistý sandbox v každém testu ho tady flushneme, jinak by
        # tests_month_filter dostal 25 races místo jednoho.
        Race.objects.all().delete()

    def test_defaults_hide_past_and_invisible(self) -> None:
        past = _make_race(name="Old", date_start=date.today() - timedelta(days=10))
        future = _make_race(name="New", date_start=date.today() + timedelta(days=10))
        hidden = _make_race(
            name="Hidden",
            date_start=date.today() + timedelta(days=15),
            is_visible=False,
        )

        resp = self.client.get("/api/races/")
        self.assertEqual(resp.status_code, drf_status.HTTP_200_OK)
        body = resp.json()
        ids = {r["id"] for r in body["results"]}
        self.assertIn(future.id, ids)
        self.assertNotIn(past.id, ids)
        self.assertNotIn(hidden.id, ids)

    def test_past_flag_includes_past(self) -> None:
        past = _make_race(name="Old", date_start=date.today() - timedelta(days=10))
        resp = self.client.get("/api/races/?past=1")
        ids = {r["id"] for r in resp.json()["results"]}
        self.assertIn(past.id, ids)

    def test_month_filter(self) -> None:
        _make_race(name="Jun", date_start=date(2027, 6, 15))
        _make_race(name="Jul", date_start=date(2027, 7, 15))

        resp = self.client.get("/api/races/?month=2027-06&past=1")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names, ["Jun"])

    def test_country_filter(self) -> None:
        _make_race(name="CZ", country="Česko")
        _make_race(name="FR", country="Francie")

        resp = self.client.get("/api/races/?country=Francie")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names, ["FR"])

    def test_full_text_search(self) -> None:
        _make_race(name="Beskydská 7", location="Beskydy")
        _make_race(name="Šumava", location="Šumava")

        resp = self.client.get("/api/races/?q=Beskyd")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names, ["Beskydská 7"])

    def test_anonymous_gets_is_favorite_false(self) -> None:
        _make_race()
        resp = self.client.get("/api/races/")
        for r in resp.json()["results"]:
            self.assertFalse(r["is_favorite"])

    def test_authenticated_sees_favorites(self) -> None:
        user = User.objects.create_user(
            email="u@example.com",
            password="pass-abcdef-1234",
            first_name="U",
            last_name="X",
            email_verified=True,
        )
        r1 = _make_race(name="A")
        _make_race(name="B")
        RaceFavorite.objects.create(user=user, race=r1)

        self.client.force_authenticate(user)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r["is_favorite"] for r in resp.json()["results"]}
        self.assertTrue(rows["A"])
        self.assertFalse(rows["B"])


class RaceFavoriteToggleTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        Race.objects.all().delete()
        self.user = User.objects.create_user(
            email="u@example.com",
            password="pass-abcdef-1234",
            first_name="U",
            last_name="X",
            email_verified=True,
        )
        self.race = _make_race(name="Beskyd")

    def test_favorite_add_and_remove(self) -> None:
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 200)
        # POST vrací RaceFavoriteSerializer — status default "interested"
        self.assertEqual(resp.json()["status"], RaceFavorite.STATUS_INTERESTED)
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            1,
        )

        # Toggle off
        resp = self.client.delete(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            0,
        )

    def test_favorite_idempotent(self) -> None:
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(
            RaceFavorite.objects.filter(user=self.user, race=self.race).count(),
            1,
        )

    def test_favorite_requires_auth(self) -> None:
        resp = self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 401)

    def test_favorite_hidden_race_404(self) -> None:
        self.race.is_visible = False
        self.race.save()
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/races/{self.race.slug}/favorite/")
        self.assertEqual(resp.status_code, 404)


class RaceFavoritePersistenceTests(TestCase):
    """Reprodukce user reportu 2026-09-26: „označil jsem další závody a dal
    si svůj status, ale po refresh mám prázdno". Testy verifikují, že
    RaceFavorite persistuje status + note po POST/PATCH a že /api/races/
    list vrací plan_status + plan_note pro authenticated user (což je
    zdroj UI stavu po refreshi).
    """

    def setUp(self) -> None:
        self.client = APIClient()
        Race.objects.all().delete()
        self.user = User.objects.create_user(
            email="p@example.com",
            password="pass-abcdef-1234",
            first_name="P",
            last_name="X",
            email_verified=True,
        )
        self.race = _make_race(name="MIUT")

    def test_post_persists_status_in_db(self) -> None:
        """POST /favorite/ s status=registered → DB row má status=registered."""
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            f"/api/races/{self.race.slug}/favorite/",
            {"status": "registered"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        fav = RaceFavorite.objects.get(user=self.user, race=self.race)
        self.assertEqual(fav.status, RaceFavorite.STATUS_REGISTERED)

    def test_post_persists_note_in_db(self) -> None:
        """POST /favorite/ s note → DB row má note uloženou."""
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            f"/api/races/{self.race.slug}/favorite/",
            {"note": "jedu s Martou"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        fav = RaceFavorite.objects.get(user=self.user, race=self.race)
        self.assertEqual(fav.note, "jedu s Martou")

    def test_patch_updates_status(self) -> None:
        """PATCH po POSTu změní status v DB."""
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/races/{self.race.slug}/favorite/")
        resp = self.client.patch(
            f"/api/races/{self.race.slug}/favorite/",
            {"status": "waitlist"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        fav = RaceFavorite.objects.get(user=self.user, race=self.race)
        self.assertEqual(fav.status, RaceFavorite.STATUS_WAITLIST)

    def test_patch_updates_note_without_touching_status(self) -> None:
        """PATCH note-only nesmí resetovat status."""
        self.client.force_authenticate(self.user)
        self.client.post(
            f"/api/races/{self.race.slug}/favorite/",
            {"status": "registered"},
            format="json",
        )
        self.client.patch(
            f"/api/races/{self.race.slug}/favorite/",
            {"note": "koupena letenka"},
            format="json",
        )
        fav = RaceFavorite.objects.get(user=self.user, race=self.race)
        self.assertEqual(fav.status, RaceFavorite.STATUS_REGISTERED)
        self.assertEqual(fav.note, "koupena letenka")

    def test_list_returns_plan_status_for_auth_user(self) -> None:
        """GET /api/races/ pro auth usera vrátí plan_status per race
        s RaceFavorite. TOHLE JE ZDROJ UI STAVU PO REFRESHI —
        pokud tady dostáváme null místo status, UI ukáže „prázdno".
        """
        RaceFavorite.objects.create(
            user=self.user,
            race=self.race,
            status=RaceFavorite.STATUS_REGISTERED,
            note="test note",
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        self.assertIn("MIUT", rows)
        self.assertEqual(rows["MIUT"]["plan_status"], "registered")
        self.assertEqual(rows["MIUT"]["plan_note"], "test note")
        self.assertTrue(rows["MIUT"]["is_favorite"])

    def test_list_returns_null_plan_status_for_non_favorite(self) -> None:
        """GET /api/races/ pro race bez favorite = plan_status None."""
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        self.assertIsNone(rows["MIUT"]["plan_status"])
        self.assertEqual(rows["MIUT"]["plan_note"], "")
        self.assertFalse(rows["MIUT"]["is_favorite"])

    def test_list_isolates_plan_between_users(self) -> None:
        """Plan usera A nesmí uniknout do responsu usera B."""
        other = User.objects.create_user(
            email="other@example.com",
            password="pass-abcdef-1234",
            first_name="O",
            last_name="Y",
            email_verified=True,
        )
        RaceFavorite.objects.create(
            user=self.user,
            race=self.race,
            status=RaceFavorite.STATUS_REGISTERED,
        )
        # Other user vidí race bez plan_status
        self.client.force_authenticate(other)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        self.assertIsNone(rows["MIUT"]["plan_status"])
        self.assertFalse(rows["MIUT"]["is_favorite"])

    def test_mine_endpoint_returns_plan_after_post(self) -> None:
        """GET /api/races/mine/ po POSTu vrátí entry — refresh-safe zdroj
        pro /u/<slug> public plan a /kalendar fav filter.
        """
        self.client.force_authenticate(self.user)
        self.client.post(
            f"/api/races/{self.race.slug}/favorite/",
            {"status": "registered", "note": "big trip"},
            format="json",
        )
        resp = self.client.get("/api/races/mine/")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "registered")
        self.assertEqual(results[0]["note"], "big trip")
        self.assertEqual(results[0]["race"]["name"], "MIUT")

    def test_full_round_trip_post_refresh_patch_refresh(self) -> None:
        """End-to-end: POST → GET (status shown) → PATCH → GET (new status
        shown). Simuluje user flow „označím + přepnu status + refresh".
        """
        self.client.force_authenticate(self.user)
        # Step 1: favoritování
        self.client.post(f"/api/races/{self.race.slug}/favorite/")
        # Step 2: refresh landing (list) — status musí být interested
        rows = {
            r["name"]: r
            for r in self.client.get("/api/races/").json()["results"]
        }
        self.assertEqual(rows["MIUT"]["plan_status"], "interested")
        # Step 3: user přepne status na registered
        self.client.patch(
            f"/api/races/{self.race.slug}/favorite/",
            {"status": "registered"},
            format="json",
        )
        # Step 4: refresh znovu — status musí být registered
        rows = {
            r["name"]: r
            for r in self.client.get("/api/races/").json()["results"]
        }
        self.assertEqual(rows["MIUT"]["plan_status"], "registered")
        self.assertTrue(rows["MIUT"]["is_favorite"])


class CommunityAwareRaceCalendarTests(TestCase):
    """Slice 1 vize „community awareness" — race calendar zná mé komunity
    a lidi v nich, ale nic neteče ne-členům. Přísně privacy-scoped.

    Setup:
    - alice + bob + carol jsou lidi
    - alice & bob spolu v „Olaf Adventures"
    - carol samotná, mimo komunity
    - MIUT race má plán od bob + carol
    """

    def setUp(self) -> None:
        self.client = APIClient()
        Race.objects.all().delete()
        Workspace.objects.all().delete()

        self.alice = _make_user("alice@example.com", "Alice", "A")
        self.bob = _make_user("bob@example.com", "Bob", "B")
        self.carol = _make_user("carol@example.com", "Carol", "C")

        self.ws_olaf = _make_workspace("olaf-adventures", "Olaf Adventures", self.alice)
        _add_member(self.ws_olaf, self.bob)
        # Carol není v žádné workspace.

        self.race_miut = _make_race(name="MIUT", location="Madeira")
        self.race_utmb = _make_race(name="UTMB", location="Chamonix")

        # bob má MIUT v plánu jako registered, carol taky jako interested
        RaceFavorite.objects.create(
            user=self.bob,
            race=self.race_miut,
            status=RaceFavorite.STATUS_REGISTERED,
            note="jedu s Alicí",
        )
        RaceFavorite.objects.create(
            user=self.carol,
            race=self.race_miut,
            status=RaceFavorite.STATUS_INTERESTED,
        )

    # --- my-communities/ ---

    def test_my_communities_requires_auth(self) -> None:
        resp = self.client.get("/api/races/my-communities/")
        self.assertEqual(resp.status_code, drf_status.HTTP_401_UNAUTHORIZED)

    def test_my_communities_lists_active_only(self) -> None:
        # bob je jen member — vidí svoji komunitu
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/races/my-communities/")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["communities"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["slug"], "olaf-adventures")
        self.assertEqual(results[0]["member_count"], 2)  # alice + bob
        self.assertEqual(results[0]["members_with_plan"], 1)  # jen bob má plán

    def test_my_communities_empty_for_loner(self) -> None:
        self.client.force_authenticate(self.carol)
        resp = self.client.get("/api/races/my-communities/")
        self.assertEqual(resp.json()["communities"], [])

    def test_my_communities_excludes_pending_and_removed(self) -> None:
        dana = _make_user("dana@example.com", "Dana")
        _add_member(self.ws_olaf, dana, status=WorkspaceMember.STATUS_PENDING)
        self.client.force_authenticate(dana)
        resp = self.client.get("/api/races/my-communities/")
        self.assertEqual(resp.json()["communities"], [])

    # --- my-community-people/ ---

    def test_my_community_people_requires_auth(self) -> None:
        resp = self.client.get("/api/races/my-community-people/")
        self.assertEqual(resp.status_code, drf_status.HTTP_401_UNAUTHORIZED)

    def test_my_community_people_returns_shared_members(self) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/my-community-people/")
        results = resp.json()["people"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["display_name"], "Bob B")
        self.assertEqual(results[0]["plan_count"], 1)  # bob má MIUT
        self.assertEqual(len(results[0]["workspaces"]), 1)
        self.assertEqual(results[0]["workspaces"][0]["slug"], "olaf-adventures")

    def test_my_community_people_excludes_self(self) -> None:
        """Alice nesmí vidět sebe v seznamu community lidí."""
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/my-community-people/")
        slugs = {p["slug"] for p in resp.json()["people"]}
        self.assertNotIn(self.alice.profile_slug, slugs)

    def test_my_community_people_empty_for_loner(self) -> None:
        self.client.force_authenticate(self.carol)
        resp = self.client.get("/api/races/my-community-people/")
        self.assertEqual(resp.json()["people"], [])

    def test_my_community_people_excludes_pending_members(self) -> None:
        dana = _make_user("dana@example.com", "Dana")
        _add_member(self.ws_olaf, dana, status=WorkspaceMember.STATUS_PENDING)
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/my-community-people/")
        slugs = {p["slug"] for p in resp.json()["people"]}
        self.assertNotIn(dana.profile_slug, slugs)

    # --- race_list ?workspace= filter ---

    def test_workspace_filter_requires_auth(self) -> None:
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        self.assertEqual(resp.status_code, drf_status.HTTP_401_UNAUTHORIZED)

    def test_workspace_filter_requires_membership(self) -> None:
        """Carol není v Olaf Adventures — dostane 403 na filtr té komunity."""
        self.client.force_authenticate(self.carol)
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_workspace_filter_returns_races_of_members(self) -> None:
        """Alice filtruje na Olaf Adventures — vidí MIUT (bob má v plánu),
        ne UTMB (nikdo). Nezáleží že carol taky MIUT má — není v komunitě.
        """
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        names = {r["name"] for r in resp.json()["results"]}
        self.assertEqual(names, {"MIUT"})

    def test_workspace_filter_deduplicates(self) -> None:
        """Když 2 členové komunity mají stejný race v plánu, řádek se
        neopakuje (distinct)."""
        RaceFavorite.objects.create(
            user=self.alice,
            race=self.race_miut,
            status=RaceFavorite.STATUS_INTERESTED,
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        names = [r["name"] for r in resp.json()["results"]]
        self.assertEqual(names.count("MIUT"), 1)

    # --- race_list ?person= filter ---

    def test_person_filter_requires_auth(self) -> None:
        resp = self.client.get(
            f"/api/races/?person={self.bob.profile_slug}"
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_401_UNAUTHORIZED)

    def test_person_filter_requires_shared_community(self) -> None:
        """Carol chce vidět bobův plán, ale nesdílí s ním komunitu → 403."""
        self.client.force_authenticate(self.carol)
        resp = self.client.get(
            f"/api/races/?person={self.bob.profile_slug}"
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_person_filter_returns_person_plan(self) -> None:
        """Alice vidí bobův plán — bob má MIUT."""
        self.client.force_authenticate(self.alice)
        resp = self.client.get(
            f"/api/races/?person={self.bob.profile_slug}"
        )
        names = {r["name"] for r in resp.json()["results"]}
        self.assertEqual(names, {"MIUT"})

    def test_person_filter_404_for_unknown_slug(self) -> None:
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/?person=neexistuje")
        self.assertEqual(resp.status_code, drf_status.HTTP_404_NOT_FOUND)

    def test_person_filter_self_works(self) -> None:
        """User může filtrovat na sebe — ne fake privacy issue.
        Vidí svůj vlastní plán."""
        RaceFavorite.objects.create(
            user=self.alice,
            race=self.race_utmb,
            status=RaceFavorite.STATUS_INTERESTED,
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get(
            f"/api/races/?person={self.alice.profile_slug}"
        )
        names = {r["name"] for r in resp.json()["results"]}
        self.assertEqual(names, {"UTMB"})

    # --- plan_by field ---

    def test_plan_by_empty_for_anonymous(self) -> None:
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        self.assertEqual(rows["MIUT"]["plan_by"], [])
        self.assertEqual(rows["UTMB"]["plan_by"], [])

    def test_plan_by_empty_for_loner(self) -> None:
        """Carol nemá komunitu → nevidí ničí plán, ani bobův."""
        self.client.force_authenticate(self.carol)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        # Carol NEUVIDÍ bobův plán (nemá s ním komunitu). Sebe taky ne
        # (excluded ze `plan_by` — vlastní status žije v plan_status).
        self.assertEqual(rows["MIUT"]["plan_by"], [])

    def test_plan_by_shows_shared_community_members(self) -> None:
        """Alice vidí bobův plán MIUT — mají spolu komunitu."""
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan = rows["MIUT"]["plan_by"]
        self.assertEqual(len(plan), 1)
        entry = plan[0]
        self.assertEqual(entry["user_slug"], self.bob.profile_slug)
        self.assertEqual(entry["display_name"], "Bob B")
        self.assertEqual(entry["status"], "registered")
        self.assertEqual(entry["note"], "jedu s Alicí")
        self.assertEqual(entry["workspaces"][0]["slug"], "olaf-adventures")

    def test_plan_by_excludes_self(self) -> None:
        """Alicin vlastní plán MIUT nesmí být v jejím `plan_by` (žije v
        `plan_status` per race)."""
        RaceFavorite.objects.create(
            user=self.alice,
            race=self.race_miut,
            status=RaceFavorite.STATUS_INTERESTED,
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan = rows["MIUT"]["plan_by"]
        slugs = {e["user_slug"] for e in plan}
        self.assertNotIn(self.alice.profile_slug, slugs)
        # Vlastní status vidí v plan_status
        self.assertEqual(rows["MIUT"]["plan_status"], "interested")

    def test_plan_by_excludes_non_shared_people(self) -> None:
        """Alice nesmí vidět carolin MIUT plán — nesdílí komunitu."""
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan = rows["MIUT"]["plan_by"]
        slugs = {e["user_slug"] for e in plan}
        self.assertNotIn(self.carol.profile_slug, slugs)

    def test_plan_by_shows_multiple_shared_communities(self) -> None:
        """Když má user 2 sdílené komunity s planned osobou, workspaces
        pole obsahuje obě."""
        ws_second = _make_workspace("mtb-crew", "MTB Crew", self.alice)
        _add_member(ws_second, self.bob)
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        entry = rows["MIUT"]["plan_by"][0]
        slugs = {w["slug"] for w in entry["workspaces"]}
        self.assertEqual(slugs, {"olaf-adventures", "mtb-crew"})

    def test_plan_by_aggregates_multiple_members(self) -> None:
        """Alice s 2 spolumembers oba plánujícími MIUT → oba v plan_by."""
        dana = _make_user("dana@example.com", "Dana")
        _add_member(self.ws_olaf, dana)
        RaceFavorite.objects.create(
            user=dana,
            race=self.race_miut,
            status=RaceFavorite.STATUS_WAITLIST,
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan = rows["MIUT"]["plan_by"]
        slugs = {e["user_slug"] for e in plan}
        self.assertEqual(
            slugs, {self.bob.profile_slug, dana.profile_slug}
        )

    def test_plan_by_includes_email_when_visible(self) -> None:
        """Default profile_show_email=True → email v plan_by."""
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan = rows["MIUT"]["plan_by"]
        entry = plan[0]
        self.assertEqual(entry["email"], self.bob.email)

    def test_plan_by_hides_email_when_toggle_off(self) -> None:
        """Když user vypne profile_show_email, plan_by dostane empty string."""
        self.bob.profile_show_email = False
        self.bob.save()
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        entry = rows["MIUT"]["plan_by"][0]
        self.assertEqual(entry["email"], "")

    def test_plan_by_phone_hidden_by_default(self) -> None:
        """profile_show_phone default False → phone není v plan_by."""
        self.bob.phone = "+420777888999"
        self.bob.save()
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        entry = rows["MIUT"]["plan_by"][0]
        self.assertEqual(entry["phone"], "")

    def test_plan_by_phone_shown_when_opted_in(self) -> None:
        """Když user zapne profile_show_phone, jde do plan_by."""
        self.bob.phone = "+420777888999"
        self.bob.profile_show_phone = True
        self.bob.save()
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        entry = rows["MIUT"]["plan_by"][0]
        self.assertEqual(entry["phone"], "+420777888999")


class CommunityHierarchyPropagationTests(TestCase):
    """Slice 2 vize — nested komunity propagují membership.

    Když je „Beskydské výběhy" child (active link) „Olaf Adventures":
    - Alice (přímý člen Beskydské) je effective member Olaf → filter
      `?workspace=olaf-adventures` jí projde.
    - Bob (přímý člen Olaf) vidí Alicin plán (i když Alice není přímý
      člen Olaf) — parent umbrella awareness.
    - Pending link (ne active) propagaci neaktivuje.
    """

    def setUp(self) -> None:
        self.client = APIClient()
        Race.objects.all().delete()
        Workspace.objects.all().delete()

        self.olaf = _make_user("olaf@example.com", "Olaf", "O")
        self.alice = _make_user("alice@example.com", "Alice", "A")
        self.bob = _make_user("bob@example.com", "Bob", "B")

        self.parent_ws = _make_workspace(
            "olaf-adventures", "Olaf Adventures", self.olaf
        )
        _add_member(self.parent_ws, self.bob)

        self.child_ws = _make_workspace(
            "beskydske", "Beskydské výběhy", self.alice
        )

        self.race_miut = _make_race(name="MIUT", location="Madeira")
        RaceFavorite.objects.create(
            user=self.alice,
            race=self.race_miut,
            status=RaceFavorite.STATUS_REGISTERED,
        )
        RaceFavorite.objects.create(
            user=self.bob,
            race=self.race_miut,
            status=RaceFavorite.STATUS_INTERESTED,
        )

    def _activate_link(self) -> None:
        """Aktivuj parent link Beskydské → Olaf."""
        self.child_ws.parent_community = self.parent_ws
        self.child_ws.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.child_ws.save()

    def _pending_link(self) -> None:
        """Pending link — neaktivní, propagace se nesmí spustit."""
        self.child_ws.parent_community = self.parent_ws
        self.child_ws.parent_link_status = Workspace.PARENT_LINK_PENDING
        self.child_ws.save()

    # --- Upstream propagation (child member → parent effective) ---

    def test_alice_effective_in_parent_after_active_link(self) -> None:
        """Alice je jen v Beskydské (child), ale s active linkem je
        effective member Olaf. Filter ?workspace=olaf-adventures jí
        projde bez 403."""
        self._activate_link()
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        self.assertEqual(resp.status_code, 200)

    def test_alice_not_effective_when_link_pending(self) -> None:
        """Bez active linku Alice není effective member Olaf → 403."""
        self._pending_link()
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_my_communities_returns_parent_via_propagation(self) -> None:
        """Alicin my-communities/ vrátí i parent Olaf, ne jen direct
        Beskydské."""
        self._activate_link()
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/races/my-communities/")
        slugs = {c["slug"] for c in resp.json()["communities"]}
        self.assertEqual(slugs, {"beskydske", "olaf-adventures"})

    # --- Downstream propagation (parent sees child members) ---

    def test_bob_sees_alice_plan_via_parent_umbrella(self) -> None:
        """Bob je v Olaf (parent), Alice v Beskydské (child, active link).
        Bob vidí Alicin MIUT plán v plan_by field."""
        self._activate_link()
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan_slugs = {e["user_slug"] for e in rows["MIUT"]["plan_by"]}
        self.assertIn(self.alice.profile_slug, plan_slugs)

    def test_bob_does_not_see_alice_when_link_pending(self) -> None:
        """Pending link nepropaguje — Bob nesmí vidět Alicin plán."""
        self._pending_link()
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/races/")
        rows = {r["name"]: r for r in resp.json()["results"]}
        plan_slugs = {e["user_slug"] for e in rows["MIUT"]["plan_by"]}
        self.assertNotIn(self.alice.profile_slug, plan_slugs)

    def test_bob_can_filter_person_alice_via_active_link(self) -> None:
        """Bob ?person=alice — musí projít, protože sdílí Olaf umbrella."""
        self._activate_link()
        self.client.force_authenticate(self.bob)
        resp = self.client.get(
            f"/api/races/?person={self.alice.profile_slug}"
        )
        self.assertEqual(resp.status_code, 200)
        names = {r["name"] for r in resp.json()["results"]}
        self.assertEqual(names, {"MIUT"})

    def test_bob_403_person_alice_without_active_link(self) -> None:
        """Bez active linku nesdílí komunitu → 403."""
        self._pending_link()
        self.client.force_authenticate(self.bob)
        resp = self.client.get(
            f"/api/races/?person={self.alice.profile_slug}"
        )
        self.assertEqual(resp.status_code, drf_status.HTTP_403_FORBIDDEN)

    def test_alice_shows_up_in_bob_community_people(self) -> None:
        """Bob's my-community-people/ vrátí Alici, i když je jen v child."""
        self._activate_link()
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/races/my-community-people/")
        slugs = {p["slug"] for p in resp.json()["people"]}
        self.assertIn(self.alice.profile_slug, slugs)

    def test_workspace_filter_returns_child_members_races(self) -> None:
        """`?workspace=olaf-adventures` (parent) vrátí i races Alice (child).
        Effective member propagation musí projít i do filter query."""
        self._activate_link()
        self.client.force_authenticate(self.bob)
        resp = self.client.get("/api/races/?workspace=olaf-adventures")
        names = {r["name"] for r in resp.json()["results"]}
        self.assertIn("MIUT", names)  # Alice (child) i Bob (direct) mají

    # --- Cycle safety ---

    def test_no_infinite_loop_on_corrupted_cycle(self) -> None:
        """Pokud se do DB nasází cycle (past bug), propagace nesmí
        zaseknout — má cap na hloubku 20."""
        # A → B → A cycle
        self.child_ws.parent_community = self.parent_ws
        self.child_ws.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.child_ws.save()
        self.parent_ws.parent_community = self.child_ws
        self.parent_ws.parent_link_status = Workspace.PARENT_LINK_ACTIVE
        self.parent_ws.save()
        self.client.force_authenticate(self.alice)
        # Query nesmí spadnout / timeoutovat
        resp = self.client.get("/api/races/my-communities/")
        self.assertEqual(resp.status_code, 200)


class SyncAgentTests(TestCase):
    """Testy pro sync agent — contradiction detection + audit trail."""

    def test_contradiction_sold_out_opens_soon(self) -> None:
        """VYPRODÁNO + „otevírá se v prosinci" = contradiction."""
        self.assertTrue(
            _detect_contradiction(
                "sold_out", "otevírá se 12.-16. 10. 2026"
            )
        )
        self.assertTrue(
            _detect_contradiction("sold_out", "registrace od 15. 11.")
        )
        self.assertTrue(
            _detect_contradiction("sold_out", "start přihlášek v listopadu")
        )

    def test_contradiction_closed_opens_soon(self) -> None:
        """UZAVŘENO + „přihlášky obvykle v lednu" = contradiction."""
        self.assertTrue(
            _detect_contradiction("closed", "přihlášky obvykle v lednu")
        )

    def test_contradiction_open_with_sold_out_keyword(self) -> None:
        self.assertTrue(
            _detect_contradiction("open", "vyprodáno za 30 minut")
        )
        self.assertTrue(_detect_contradiction("open", "loterie v prosinci"))

    def test_no_contradiction_when_consistent(self) -> None:
        # „volně, přihlašuj na webu" — žádné contradiction keywords
        self.assertFalse(
            _detect_contradiction("open", "volně, přihlašuj na webu")
        )
        self.assertFalse(_detect_contradiction("open", ""))
        # Lottery status + „loterie" detail = consistent, ne contradiction
        self.assertFalse(_detect_contradiction("lottery", "loterie od prosince"))
        # Known false-positive: „žádná loterie" v open statusu chytí
        # regex — future improvement, teď zdokumentované jako expected.
        self.assertTrue(
            _detect_contradiction("open", "volně, žádná loterie")
        )

    def test_syncrun_creation(self) -> None:
        """SyncRun se vytvoří pro každý run."""
        run = SyncRun.objects.create(
            source=SyncRun.SOURCE_LOCAL,
            status=SyncRun.STATUS_OK,
            created_count=5,
            triggered_by="test",
        )
        self.assertIsNotNone(run.pk)
        self.assertEqual(SyncRun.objects.count(), 1)


class SyncFieldExtractionTests(TestCase):
    """Regresní testy pro _extract_fields — bug 2026-09-29: nové races
    padaly s IntegrityError, protože date_start nebyl derived ze
    source JSON. Fix: derive z month + next.year + date{year} string."""

    def _cmd(self):
        from races.management.commands.sync_races import Command

        return Command()

    def test_derives_date_start_from_month_and_year(self) -> None:
        """`next.year` + `month` bez date2027 → 1. den měsíce daného roku."""
        cmd = self._cmd()
        fields = cmd._extract_fields(
            {
                "id": "test",
                "name": "Test Race",
                "km": 42,
                "month": 6,
                "next": {"year": 2027, "label": "obvykle červen"},
            }
        )
        import datetime as dt

        self.assertEqual(fields["date_start"], dt.date(2027, 6, 1))

    def test_derives_day_from_date_string(self) -> None:
        """date2027 = „26. 6." → date_start má den 26."""
        cmd = self._cmd()
        fields = cmd._extract_fields(
            {
                "id": "test",
                "name": "Test",
                "km": 42,
                "month": 6,
                "next": {"year": 2027},
                "date2027": "26. 6.",
            }
        )
        import datetime as dt

        self.assertEqual(fields["date_start"], dt.date(2027, 6, 26))
        self.assertEqual(fields["date_display"], "26. 6.")

    def test_tba_date_falls_back_to_day_1(self) -> None:
        """date2027 = „TBA" → day=1 pro řazení."""
        cmd = self._cmd()
        fields = cmd._extract_fields(
            {
                "id": "test",
                "name": "Test",
                "km": 42,
                "month": 8,
                "next": {"year": 2027},
                "date2027": "TBA",
            }
        )
        import datetime as dt

        self.assertEqual(fields["date_start"], dt.date(2027, 8, 1))

    def test_multi_day_range_takes_start(self) -> None:
        """date2027 = „5.-7. 8." → start = 5."""
        cmd = self._cmd()
        fields = cmd._extract_fields(
            {
                "id": "test",
                "name": "Test",
                "km": 100,
                "month": 8,
                "next": {"year": 2027},
                "date2027": "5.-7. 8.",
            }
        )
        import datetime as dt

        self.assertEqual(fields["date_start"], dt.date(2027, 8, 5))

    def test_day_capped_to_month_length(self) -> None:
        """day=31 pro únor → clampne na 28."""
        cmd = self._cmd()
        fields = cmd._extract_fields(
            {
                "id": "test",
                "name": "Test",
                "km": 42,
                "month": 2,
                "next": {"year": 2027},  # 2027 není přestupný
                "date2027": "31. 2.",  # divná hodnota
            }
        )
        import datetime as dt

        self.assertEqual(fields["date_start"], dt.date(2027, 2, 28))

    def test_invalid_month_falls_back(self) -> None:
        """month=0 → date(year, 1, 1) fallback, nevyhodí exception."""
        cmd = self._cmd()
        fields = cmd._extract_fields(
            {
                "id": "test",
                "name": "Test",
                "km": 42,
                "month": 0,
                "next": {"year": 2027},
            }
        )
        import datetime as dt

        self.assertEqual(fields["date_start"], dt.date(2027, 1, 1))

    def test_new_race_creates_successfully(self) -> None:
        """End-to-end: nová race se vytvoří přes sync bez IntegrityError.
        Regression test pro bug 2026-09-29."""
        from django.core.management import call_command
        from io import StringIO
        from unittest import mock

        Race.objects.filter(slug="test-mont-blanc").delete()
        events = [
            {
                "id": "test-mont-blanc",
                "name": "Test 42 km du Mont-Blanc",
                "sport": "beh",
                "km": 42,
                "dplus": 2800,
                "month": 6,
                "next": {"year": 2027, "label": "obvykle červen"},
                "date2027": "27. 6.",
                "top": True,
                "region": "ALP",
                "country": "Francie",
                "place": "Chamonix",
                "series": "Nezávislý",
                "registration": {"type": "L", "detail": "loterie"},
                "web": "https://www.marathonmontblanc.fr/",
                "highlight": "Test race",
                "warn": False,
            }
        ]
        buf = StringIO()
        with mock.patch(
            "races.management.commands.sync_races._load_local",
            return_value=events,
        ):
            call_command(
                "sync_races",
                "--source",
                "local",
                "--triggered-by",
                "test",
                stdout=buf,
            )
        race = Race.objects.get(slug="test-mont-blanc")
        self.assertEqual(race.distance_km, 42)
        self.assertTrue(race.is_top)
        import datetime as dt
        self.assertEqual(race.date_start, dt.date(2027, 6, 27))
