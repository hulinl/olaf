"""Public race calendar API — list, favorite toggle, user race plan.

Endpoints:
- GET    /api/races/                          — list visible races
- GET    /api/races/countries/                — distinct countries
- POST   /api/races/<slug>/favorite/          — add ★, optional {status, note}
- PATCH  /api/races/<slug>/favorite/          — update status/note
- DELETE /api/races/<slug>/favorite/          — remove ★
- GET    /api/races/mine/                     — my race plan (auth)
- GET    /api/races/plan/<user_slug>/         — public race plan per user

Filtry přes query params (list):
- ?past=1 — include past races
- ?from=YYYY-MM-DD&to=YYYY-MM-DD — date range
- ?year=YYYY, ?month=YYYY-MM — legacy single-year/month picks
- ?country=Česko, ?region=CZ, ?sport=trail
- ?series=utmb, ?min_km=40&max_km=200
- ?q=Beskyd — full-text
- ?fav=1 — jen moje oblíbené (auth)
- ?top=1 — jen top výběr
"""
from __future__ import annotations

import contextlib
from datetime import date

from django.db.models import Count, Q, QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Race, RaceFavorite
from .serializers import RaceFavoriteSerializer, RaceSerializer


def _apply_filters(qs: QuerySet[Race], request: Request) -> QuerySet[Race]:
    if request.query_params.get("past") != "1":
        qs = qs.filter(date_start__gte=date.today())

    year = request.query_params.get("year")
    if year and year.isdigit():
        qs = qs.filter(date_start__year=int(year))

    date_from = request.query_params.get("from")
    if date_from:
        with contextlib.suppress(ValueError):
            qs = qs.filter(date_start__gte=date.fromisoformat(date_from))
    date_to = request.query_params.get("to")
    if date_to:
        with contextlib.suppress(ValueError):
            qs = qs.filter(date_start__lte=date.fromisoformat(date_to))

    month = request.query_params.get("month")
    if month:
        try:
            year_s, mnum = month.split("-")
            year_i, m_i = int(year_s), int(mnum)
            if 1 <= m_i <= 12:
                start = date(year_i, m_i, 1)
                end = (
                    date(year_i + 1, 1, 1)
                    if m_i == 12
                    else date(year_i, m_i + 1, 1)
                )
                qs = qs.filter(date_start__gte=start, date_start__lt=end)
        except (ValueError, TypeError):
            pass

    country = request.query_params.get("country")
    if country:
        qs = qs.filter(country__iexact=country)

    series = request.query_params.get("series")
    if series:
        qs = qs.filter(series=series)

    sport = request.query_params.get("sport")
    if sport:
        qs = qs.filter(sport=sport)

    region = request.query_params.get("region")
    if region:
        qs = qs.filter(region=region)

    if request.query_params.get("top") == "1":
        qs = qs.filter(is_top=True)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(location__icontains=q)
            | Q(country__icontains=q)
            | Q(highlight__icontains=q)
        )

    min_km = request.query_params.get("min_km")
    if min_km and min_km.isdigit():
        qs = qs.filter(distance_km__gte=int(min_km))
    max_km = request.query_params.get("max_km")
    if max_km and max_km.isdigit():
        qs = qs.filter(distance_km__lte=int(max_km))

    return qs


def _user_fav_status(user) -> dict[int, dict[str, str]]:
    """Vrátí dict race_id → {status, note} pro bulk lookup v seriálu."""
    if not user or not user.is_authenticated:
        return {}
    return {
        row["race_id"]: {"status": row["status"], "note": row["note"]}
        for row in RaceFavorite.objects.filter(user=user).values(
            "race_id", "status", "note"
        )
    }


def _my_active_workspace_ids(user) -> set[int]:
    """Set workspace IDs, kde je user effective member — přímé
    membershipy + parent komunity těch přímých (upstream propagation
    přes active parent link). Prázdný set pro anon / loner.

    Příklad: User je v „Beskydské výběhy" (child) a child.parent =
    „Olaf Adventures" s parent_link_status=active. Effective set =
    {Beskydské, Olaf}. Filter `?workspace=olaf-adventures` mu proto
    projde, i když není přímý member Olaf.
    """
    from workspaces.models import Workspace, WorkspaceMember

    if not user or not user.is_authenticated:
        return set()
    direct = set(
        WorkspaceMember.objects.filter(
            user=user, status=WorkspaceMember.STATUS_ACTIVE
        ).values_list("workspace_id", flat=True)
    )
    if not direct:
        return set()

    # Transitive parents (via active parent link). Max hloubka 20 pro
    # ochranu proti poškozeným datům s cyklem.
    all_ws = set(direct)
    frontier = direct
    for _ in range(20):
        new_parents = set(
            Workspace.objects.filter(
                id__in=frontier,
                parent_community_id__isnull=False,
                parent_link_status=Workspace.PARENT_LINK_ACTIVE,
            ).values_list("parent_community_id", flat=True)
        ) - all_ws
        if not new_parents:
            break
        all_ws |= new_parents
        frontier = new_parents
    return all_ws


def _related_workspace_ids(effective_ws: set[int]) -> set[int]:
    """K uživatelovým effective workspaces přidá i děti (jeden hop
    downstream). Umožňuje aby parent umbrella (Olaf Adventures) viděl
    plány members children (Beskydské výběhy atd.).

    Ne-transitive — grandchildren se nepropagují dál, abychom neměli
    „vidí všechno pod kořenem". Two-tier hierarchie je MVP scope.
    """
    from workspaces.models import Workspace

    if not effective_ws:
        return set()
    result = set(effective_ws)
    children = set(
        Workspace.objects.filter(
            parent_community_id__in=effective_ws,
            parent_link_status=Workspace.PARENT_LINK_ACTIVE,
        ).values_list("id", flat=True)
    )
    result |= children
    return result


def _plan_by_lookup(request: Request) -> dict[int, list[dict]]:
    """Pro každý race_id vrátí list plánů (user + status + workspaces)
    od uživatelů, kteří sdílí komunitu s requesting userem. Vylučuje
    requesting usera samotného (jeho plán žije v is_favorite/plan_status
    per race).

    Empty dict pro anon nebo uživatele bez community → community sharing
    je off-limits pro loners.
    """
    from workspaces.models import Workspace, WorkspaceMember

    my_ws_ids = _my_active_workspace_ids(request.user)
    if not my_ws_ids:
        return {}

    # Downstream — přidá i children mých effective workspaces, aby parent
    # umbrella viděl plány member of children (Olaf ⇢ Beskydské výběhy).
    all_related_ws = _related_workspace_ids(my_ws_ids)

    # Slovník user_id → list of {slug, name} workspaces sdílených s user.request
    # (jenom sdílené, ne všechny userovy komunity — public race plán respektuje
    # kontext, kde se dva lidi vidí).
    shared_ws_by_user: dict[int, list[dict]] = {}
    for row in (
        WorkspaceMember.objects.filter(
            workspace_id__in=all_related_ws,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        .exclude(user=request.user)
        .values("user_id", "workspace__slug", "workspace__name")
    ):
        shared_ws_by_user.setdefault(row["user_id"], []).append(
            {"slug": row["workspace__slug"], "name": row["workspace__name"]}
        )
    if not shared_ws_by_user:
        return {}

    # Fetch všechny RaceFavorite pro tyto users v jednom queries. Distinct
    # ne — user může mít stejný závod jen jednou (unique_together).
    result: dict[int, list[dict]] = {}
    plans = (
        RaceFavorite.objects.filter(user_id__in=shared_ws_by_user.keys())
        .select_related("user")
        .values(
            "race_id",
            "user_id",
            "user__profile_slug",
            "user__first_name",
            "user__last_name",
            "user__email",
            "status",
            "note",
        )
    )
    for row in plans:
        display_name = (
            f"{row['user__first_name']} {row['user__last_name']}".strip()
            or row["user__email"].split("@")[0]
        )
        result.setdefault(row["race_id"], []).append(
            {
                "user_slug": row["user__profile_slug"],
                "display_name": display_name,
                "status": row["status"],
                "note": row["note"],
                "workspaces": shared_ws_by_user[row["user_id"]],
            }
        )
    # Vyhoď unused workspace reference — abychom nevraceli globální fetch
    _ = Workspace  # noqa: F841 — kept import readable
    return result


@api_view(["GET"])
@permission_classes([AllowAny])
def race_list(request: Request) -> Response:
    from workspaces.models import WorkspaceMember

    qs = Race.objects.filter(is_visible=True)
    qs = _apply_filters(qs, request)

    if request.query_params.get("fav") == "1":
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Login required for favorites filter."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        qs = qs.filter(favorites__user=request.user)

    # Community filter — ukazuj jen races, které má v plánu nějaký
    # effective member té komunity (direct + z active-link children).
    # Vyžaduje, aby requesting user byl effective member té komunity
    # (privacy: ne-člen nesmí prozřít plány cizí komunity).
    workspace_slug = request.query_params.get("workspace")
    if workspace_slug:
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Přihlaš se pro filtr podle komunity."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        from workspaces.models import Workspace

        target_ws = Workspace.objects.filter(slug=workspace_slug).first()
        if not target_ws:
            return Response(
                {"detail": "Komunita nenalezena."},
                status=status.HTTP_404_NOT_FOUND,
            )
        my_effective = _my_active_workspace_ids(request.user)
        if target_ws.pk not in my_effective:
            return Response(
                {"detail": "Nejsi členem této komunity."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Effective members target ws = direct members + members of
        # active-link children. Include children in the filter set.
        ws_ids = {target_ws.pk} | set(
            Workspace.objects.filter(
                parent_community=target_ws,
                parent_link_status=Workspace.PARENT_LINK_ACTIVE,
            ).values_list("id", flat=True)
        )
        qs = qs.filter(
            favorites__user__workspace_memberships__workspace_id__in=ws_ids,
            favorites__user__workspace_memberships__status=(
                WorkspaceMember.STATUS_ACTIVE
            ),
        ).distinct()

    # Person filter — races, které má v plánu konkrétní osoba. Musí
    # sdílet aspoň jednu komunitu s requesting userem.
    person_slug = request.query_params.get("person")
    if person_slug:
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Přihlaš se pro filtr podle osoby."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        from accounts.models import User as UserModel

        person = UserModel.objects.filter(profile_slug=person_slug).first()
        if not person:
            return Response(
                {"detail": "Uživatel nenalezen."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if person.pk == request.user.pk:
            # Self-filter → user vidí svůj plán přes is_favorite; ale
            # ponecháme to fungovat pro konzistenci.
            qs = qs.filter(favorites__user=person)
        else:
            # Shared community — respektuje parent/child propagaci.
            # Person je effective member některé mojí effective komunity,
            # když je direct member kterékoli z mých effective ws NEBO
            # z jejich active-link children.
            my_effective = _my_active_workspace_ids(request.user)
            all_related = _related_workspace_ids(my_effective)
            shared = WorkspaceMember.objects.filter(
                user=person,
                workspace_id__in=all_related,
                status=WorkspaceMember.STATUS_ACTIVE,
            ).exists()
            if not shared:
                return Response(
                    {"detail": "Nesdílíš s touto osobou komunitu."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            qs = qs.filter(favorites__user=person)

    lookup = _user_fav_status(request.user)
    plan_by = _plan_by_lookup(request)
    serializer = RaceSerializer(
        qs,
        many=True,
        context={
            "request": request,
            "user_favorite_status": lookup,
            "plan_by_lookup": plan_by,
        },
    )
    return Response({"count": qs.count(), "results": serializer.data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def race_my_communities(request: Request) -> Response:
    """Communities kde je requesting user active member — pro race
    calendar community filter dropdown. Vrací i member count a
    počet členů s aspoň jedním race favorite (pro empty-state hint).
    """
    from django.db.models import Count
    from workspaces.models import Workspace, WorkspaceMember

    my_ws_ids = _my_active_workspace_ids(request.user)
    if not my_ws_ids:
        return Response({"communities": []})

    workspaces = Workspace.objects.filter(pk__in=my_ws_ids).annotate(
        member_count=Count(
            "members",
            filter=Q(members__status=WorkspaceMember.STATUS_ACTIVE),
            distinct=True,
        ),
    )

    results = []
    for ws in workspaces:
        # Kolik unikátních členů má aspoň jeden race favorit
        plan_member_count = (
            RaceFavorite.objects.filter(
                user__workspace_memberships__workspace=ws,
                user__workspace_memberships__status=(
                    WorkspaceMember.STATUS_ACTIVE
                ),
            )
            .values("user")
            .distinct()
            .count()
        )
        results.append(
            {
                "slug": ws.slug,
                "name": ws.name,
                "member_count": ws.member_count,
                "members_with_plan": plan_member_count,
            }
        )
    # Řadit podle jména pro stabilní dropdown
    results.sort(key=lambda r: r["name"].lower())
    return Response({"communities": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def race_my_community_people(request: Request) -> Response:
    """Lidi z komunit kde je requesting user active member, se sdílenými
    komunitami a počtem races v plánu. Prohledávatelný autocomplete
    seznam pro person filter na race calendar.
    """
    from accounts.models import User as UserModel
    from workspaces.models import WorkspaceMember

    my_ws_ids = _my_active_workspace_ids(request.user)
    if not my_ws_ids:
        return Response({"people": []})

    # Downstream propagation — include members of active-link children.
    all_related_ws = _related_workspace_ids(my_ws_ids)

    # Distinct users z těchto workspaces, mimo mě
    person_ids = set(
        WorkspaceMember.objects.filter(
            workspace_id__in=all_related_ws,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        .exclude(user=request.user)
        .values_list("user_id", flat=True)
    )
    if not person_ids:
        return Response({"people": []})

    # Předpočítej: user_id → list sdílených workspaces {slug, name}.
    # Ukazujeme workspace, kde jsou přímí member — může to být můj
    # effective ws (přímo sdílíme) NEBO child ws mého effective ws
    # (moje umbrella umožňuje viditelnost).
    shared_ws: dict[int, list[dict]] = {}
    for row in (
        WorkspaceMember.objects.filter(
            user_id__in=person_ids,
            workspace_id__in=all_related_ws,
            status=WorkspaceMember.STATUS_ACTIVE,
        ).values("user_id", "workspace__slug", "workspace__name")
    ):
        shared_ws.setdefault(row["user_id"], []).append(
            {"slug": row["workspace__slug"], "name": row["workspace__name"]}
        )

    # Předpočítej: user_id → plan_count
    plan_counts: dict[int, int] = {}
    for row in (
        RaceFavorite.objects.filter(user_id__in=person_ids)
        .values("user_id")
        .annotate(cnt=Count("id"))
    ):
        plan_counts[row["user_id"]] = row["cnt"]

    people = UserModel.objects.filter(pk__in=person_ids).order_by(
        "first_name", "last_name", "email"
    )
    results = []
    for p in people:
        display_name = (
            f"{p.first_name} {p.last_name}".strip() or p.email.split("@")[0]
        )
        results.append(
            {
                "slug": p.profile_slug,
                "display_name": display_name,
                "workspaces": shared_ws.get(p.pk, []),
                "plan_count": plan_counts.get(p.pk, 0),
            }
        )
    return Response({"people": results})


@api_view(["POST", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def race_favorite_toggle(request: Request, slug: str) -> Response:
    """POST — add/replace ★ s optional status/note.
    PATCH — update pouze status/note bez re-create.
    DELETE — remove ★.
    """
    race = get_object_or_404(Race, slug=slug, is_visible=True)

    valid_statuses = {v for v, _ in RaceFavorite.STATUS_CHOICES}

    if request.method in {"POST", "PATCH"}:
        payload_status = request.data.get("status")
        payload_note = request.data.get("note")

        if payload_status is not None and payload_status not in valid_statuses:
            return Response(
                {"status": f"Neznámý status. Povolené: {sorted(valid_statuses)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.method == "POST":
            fav, created = RaceFavorite.objects.get_or_create(
                user=request.user, race=race
            )
            # POST bez status → default `interested` na new, keep na existing
            if payload_status:
                fav.status = payload_status
            elif created:
                # already default from model
                pass
            if payload_note is not None:
                fav.note = payload_note[:280]
            fav.save()
        else:
            # PATCH — musí existovat
            fav = RaceFavorite.objects.filter(user=request.user, race=race).first()
            if not fav:
                return Response(
                    {"detail": "Race není v tvém plánu — nejdřív POST."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if payload_status is not None:
                fav.status = payload_status
            if payload_note is not None:
                fav.note = payload_note[:280]
            fav.save()

        return Response(
            RaceFavoriteSerializer(
                fav, context={"request": request}
            ).data
        )

    # DELETE
    RaceFavorite.objects.filter(user=request.user, race=race).delete()
    return Response({"deleted": True}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def race_plan_mine(request: Request) -> Response:
    """Vrátí kompletní race plán aktuálního usera. Filtry přes:
    - ?status=interested / registered / … (single)
    - ?year=YYYY (odpovídá race.next_year)
    - ?sport=trail / skialp
    """
    qs = RaceFavorite.objects.filter(user=request.user).select_related("race")
    st = request.query_params.get("status")
    if st:
        qs = qs.filter(status=st)
    year = request.query_params.get("year")
    if year and year.isdigit():
        qs = qs.filter(race__next_year=int(year))
    sport = request.query_params.get("sport")
    if sport:
        qs = qs.filter(race__sport=sport)

    qs = qs.order_by("race__date_start")

    serializer = RaceFavoriteSerializer(
        qs, many=True, context={"request": request}
    )
    return Response({"count": qs.count(), "results": serializer.data})


@api_view(["GET"])
@permission_classes([AllowAny])
def race_plan_public(request: Request, user_slug: str) -> Response:
    """Public race plan per user slug — pro sdílení („mrkni na můj
    race plán 2027"). Vrátí jen non-private records (do budoucna
    per-entry visibility field). Zatím vše viditelné.

    Filtry stejné jako mine/: ?status, ?year, ?sport.
    """
    from accounts.models import User

    user = User.objects.filter(profile_slug=user_slug).first()
    if not user:
        return Response(
            {"detail": "Profil nenalezen."}, status=status.HTTP_404_NOT_FOUND
        )

    qs = RaceFavorite.objects.filter(user=user).select_related("race")
    st = request.query_params.get("status")
    if st:
        qs = qs.filter(status=st)
    year = request.query_params.get("year")
    if year and year.isdigit():
        qs = qs.filter(race__next_year=int(year))
    sport = request.query_params.get("sport")
    if sport:
        qs = qs.filter(race__sport=sport)

    qs = qs.order_by("race__date_start")

    serializer = RaceFavoriteSerializer(
        qs, many=True, context={"request": request}
    )
    return Response(
        {
            "user": {
                "slug": user_slug,
                "display_name": user.get_full_name() or user_slug,
            },
            "count": qs.count(),
            "results": serializer.data,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def race_sync_status(request: Request) -> Response:
    """Vrátí info o posledním úspěšném sync běhu — pro veřejný display
    „aktualizováno před X hodinami" na kalendáři. Buduje důvěru
    v aktuálnost dat.
    """
    from .models import SyncRun

    latest_ok = (
        SyncRun.objects.filter(status=SyncRun.STATUS_OK)
        .order_by("-created_at")
        .first()
    )
    latest_any = SyncRun.objects.order_by("-created_at").first()

    return Response(
        {
            "last_success": (
                {
                    "at": latest_ok.created_at.isoformat(),
                    "source": latest_ok.source,
                    "created": latest_ok.created_count,
                    "updated": latest_ok.updated_count,
                    "flagged": latest_ok.flagged_count,
                }
                if latest_ok
                else None
            ),
            "last_run": (
                {
                    "at": latest_any.created_at.isoformat(),
                    "status": latest_any.status,
                }
                if latest_any
                else None
            ),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def race_countries(request: Request) -> Response:
    countries = (
        Race.objects.filter(is_visible=True, date_start__gte=date.today())
        .exclude(country="")
        .values_list("country", flat=True)
        .distinct()
        .order_by("country")
    )
    return Response({"countries": list(countries)})
